import { queryJobs } from "@/lib/jobs";
import Link from "next/link";
import { DB_PATH, db } from "@/lib/db";
import SyncButton from "./SyncButton";
import TopBar from "@/app/components/TopBar";
import { alljobsMediaUrl } from "@/lib/alljobs";

// This page depends on a local DB and "now" (days-left), so it must not be statically cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function asString(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function asNumber(v: string | string[] | undefined) {
  const s = asString(v);
  if (!s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function withParams(
  base: Record<string, string>,
  next: Record<string, string | undefined>
) {
  const sp = new URLSearchParams(base);
  for (const [k, v] of Object.entries(next)) {
    if (!v) sp.delete(k);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function formatDhakaDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

function formatDhakaDateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function daysLeft(deadlineIso: string) {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function initials(input: string) {
  const s = (input || "").replace(/\s+/g, " ").trim();
  if (!s) return "??";
  const parts = s.split(" ").filter(Boolean);
  const a = parts[0]?.[0] ?? "?";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "?";
  return (a + b).toUpperCase();
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const page = asNumber(sp.page) ?? 1;
  const limit = asNumber(sp.limit) ?? 20;
  const q = asString(sp.q);
  const jobType = asNumber(sp.jobType);
  const organizationId = asNumber(sp.organizationId);
  const computerOnly = asString(sp.computerOnly) === "1";
  const dataEntryOnly = asString(sp.dataEntryOnly) === "1";

  const postedToday = asString(sp.postedToday) === "1";
  const deadlineToday = asString(sp.deadlineToday) === "1";
  const expiresInDays = asNumber(sp.expiresInDays);
  const sort = asString(sp.sort) as "deadline" | "published" | "";
  const activeOnly = asString(sp.activeOnly) !== "0";

  const baseParams: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(jobType ? { jobType: String(jobType) } : {}),
    ...(organizationId ? { organizationId: String(organizationId) } : {}),
    ...(computerOnly ? { computerOnly: "1" } : {}),
    ...(dataEntryOnly ? { dataEntryOnly: "1" } : {}),
    ...(postedToday ? { postedToday: "1" } : {}),
    ...(deadlineToday ? { deadlineToday: "1" } : {}),
    ...(expiresInDays ? { expiresInDays: String(expiresInDays) } : {}),
    ...(sort ? { sort } : {}),
    ...(!activeOnly ? { activeOnly: "0" } : {}),
    ...(limit !== 20 ? { limit: String(limit) } : {}),
  };

  const data = queryJobs({
    page,
    limit,
    q,
    jobType,
    organizationId,
    computerOnly,
    dataEntryOnly,
    postedToday,
    deadlineToday,
    expiresInDays,
    sort: sort === "deadline" || sort === "published" ? sort : undefined,
    activeOnly,
  });

  const counts = db
    .prepare(
      `
      SELECT
        SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) AS active_total,
        SUM(CASE WHEN is_active=1 AND job_type=1 THEN 1 ELSE 0 END) AS active_govt,
        SUM(CASE WHEN is_active=1 AND job_type=2 THEN 1 ELSE 0 END) AS active_private
      FROM jobs
    `
    )
    .get() as {
    active_total: number | null;
    active_govt: number | null;
    active_private: number | null;
  };

  const lastRun = db
    .prepare(
      "SELECT finished_at, ok, error FROM sync_runs ORDER BY id DESC LIMIT 1"
    )
    .get() as
    | { finished_at: string | null; ok: number; error: string | null }
    | undefined;

  return (
    <>
      <TopBar right={<SyncButton />} />
      <div className="container">
        <div className="pageHead">
          <div>
            <h1 className="pageTitle">Jobs</h1>
            <p className="muted">
              Mirrored from{" "}
              <a className="link" href="https://alljobs.teletalk.com.bd/jobs" target="_blank" rel="noreferrer">
                alljobs.teletalk.com.bd
              </a>
              {lastRun?.finished_at ? (
                <>
                  {" "}
                  <span className="dot" aria-hidden="true" />
                  Last sync: <b>{formatDhakaDateTime(lastRun.finished_at)}</b>
                </>
              ) : null}
            </p>
            {lastRun && !lastRun.ok ? (
              <p className="warn">
                Last sync failed: <code>{lastRun.error ?? "Unknown error"}</code>
              </p>
            ) : null}
            {process.env.JOBMIRROR_DEBUG === "1" ? (
              <p className="muted" style={{ marginTop: 6 }}>
                DB: <code>{DB_PATH}</code>
              </p>
            ) : null}
          </div>
        </div>

        <div className="layout">
          <aside className="sidebar">
            <form className="panel" method="get" action="/jobs">
              <div className="panelTitle">Search & filters</div>

              <div className="field">
                <label className="fieldLabel" htmlFor="q">
                  Keyword
                </label>
                <input
                  id="q"
                  className="input"
                  type="search"
                  name="q"
                  placeholder="Title, org, job id..."
                  defaultValue={q}
                />
              </div>

              <label className="check">
                <input
                  type="checkbox"
                  name="computerOnly"
                  value="1"
                  defaultChecked={computerOnly}
                />
                Computer jobs only
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  name="dataEntryOnly"
                  value="1"
                  defaultChecked={dataEntryOnly}
                />
                Data entry jobs only
              </label>

              <div className="fieldRow">
                <div className="field">
                  <label className="fieldLabel" htmlFor="jobType">
                    Type
                  </label>
                  <select
                    id="jobType"
                    className="select"
                    name="jobType"
                    defaultValue={jobType ? String(jobType) : ""}
                  >
                    <option value="">All</option>
                    <option value="1">Government</option>
                    <option value="2">Private</option>
                  </select>
                </div>
                <div className="field">
                  <label className="fieldLabel" htmlFor="sort">
                    Sort
                  </label>
                  <select
                    id="sort"
                    className="select"
                    name="sort"
                    defaultValue={sort || "published"}
                  >
                    <option value="published">Newest</option>
                    <option value="deadline">Deadline soon</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label className="fieldLabel" htmlFor="expiresInDays">
                  Expiration
                </label>
                <select
                  id="expiresInDays"
                  className="select"
                  name="expiresInDays"
                  defaultValue={expiresInDays ? String(expiresInDays) : ""}
                >
                  <option value="">Any</option>
                  <option value="3">Expires in 3 days</option>
                  <option value="7">Expires in 7 days</option>
                </select>
              </div>

              <div className="divider" role="separator" />

              <label className="check">
                <input
                  type="checkbox"
                  name="postedToday"
                  value="1"
                  defaultChecked={postedToday}
                />
                Posted today
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  name="deadlineToday"
                  value="1"
                  defaultChecked={deadlineToday}
                />
                Deadline today
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  name="activeOnly"
                  value="0"
                  defaultChecked={!activeOnly}
                />
                Include expired jobs
              </label>

              <div className="panelActions">
                <button className="btnPrimary" type="submit">
                  Search
                </button>
                <Link className="btn" href="/jobs">
                  Reset
                </Link>
              </div>
            </form>

            <div className="panel panelSoft">
              <div className="panelTitle">Live jobs</div>
              <div className="statGrid">
                <div className="stat">
                  <div className="statVal">{counts?.active_total ?? 0}</div>
                  <div className="statLabel">Total</div>
                </div>
                <div className="stat">
                  <div className="statVal">{counts?.active_govt ?? 0}</div>
                  <div className="statLabel">Government</div>
                </div>
                <div className="stat">
                  <div className="statVal">{counts?.active_private ?? 0}</div>
                  <div className="statLabel">Private</div>
                </div>
              </div>
            </div>
          </aside>

          <main className="content">
            <div className="contentMeta">
              <div>
                Showing <b>{data.items.length}</b> of <b>{data.total}</b> jobs
              </div>
              <div className="muted">
                Page <b>{data.page}</b> / <b>{data.totalPages}</b>
              </div>
            </div>

            <div className="jobGrid">
              {data.items.map((j) => {
                const left = daysLeft(j.deadline_at);
                const leftLabel = left >= 0 ? `${left} days left` : `Expired`;
                const urgency =
                  left < 0 ? "expired" : left <= 3 ? "danger" : left <= 10 ? "warn" : "ok";
                const detailsHref =
                  j.job_type === 1
                    ? `/jobs/government/${j.organization_id}?jobId=${j.job_primary_id}`
                    : `/jobs/private/${j.recruiter_id}?jobId=${j.job_primary_id}`;

                const logoUrl = j.logo_path ? alljobsMediaUrl(j.logo_path) : null;
                const fallback = initials(j.short_name || j.org_name);
                const typeLabel = j.job_type === 1 ? "Govt" : "Private";

                return (
                  <article key={j.job_primary_id} className="jobCard">
                    <div className="jobTop">
                      <div className="jobIdentity">
                        <div className="orgLogo" aria-hidden="true">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className="orgLogoImg"
                              src={logoUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="orgLogoFallback">{fallback}</div>
                          )}
                        </div>
                        <div className="titleBlock">
                          <div className="jobTitleRow">
                            <h3 className="jobTitle">{j.job_title}</h3>
                            <span className={`pill pill-${urgency}`}>{leftLabel}</span>
                          </div>
                          <div className="jobSubRow">
                            <span className="badge">{typeLabel}</span>
                            <span className="jobSub">{j.short_name || j.org_name}</span>
                            <span className="dot" aria-hidden="true" />
                            <span className="jobSub">{j.job_id}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="facts">
                      <div>
                        <div className="factLabel">Vacancy</div>
                        <div className="factVal">{j.vacancy || "-"}</div>
                      </div>
                      <div>
                        <div className="factLabel">Posted</div>
                        <div className="factVal">{formatDhakaDate(j.published_at)}</div>
                      </div>
                      <div>
                        <div className="factLabel">Deadline</div>
                        <div className="factVal">{formatDhakaDate(j.deadline_at)}</div>
                      </div>
                      <div>
                        <div className="factLabel">Views</div>
                        <div className="factVal">{j.view_count}</div>
                      </div>
                    </div>

                    <div className="jobBottom">
                      <Link className="btnSmall" href={detailsHref}>
                        Details
                      </Link>
                      <a
                        className="btnSmall btnPrimarySoft"
                        href={j.application_site_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Apply
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            <nav className="pager">
              <Link
                className={`btn ${data.page <= 1 ? "btnDisabled" : ""}`}
                aria-disabled={data.page <= 1}
                href={`/jobs${withParams(baseParams, {
                  page: data.page > 1 ? String(data.page - 1) : undefined,
                })}`}
              >
                Prev
              </Link>
              <Link
                className={`btn ${data.page >= data.totalPages ? "btnDisabled" : ""}`}
                aria-disabled={data.page >= data.totalPages}
                href={`/jobs${withParams(baseParams, {
                  page: data.page < data.totalPages ? String(data.page + 1) : undefined,
                })}`}
              >
                Next
              </Link>
            </nav>
          </main>
        </div>
      </div>
    </>
  );
}
