import { alljobsMediaUrl, fetchGovtJobPublicDetails, type GovtJobPublicDetails } from "@/lib/alljobs";
import { getJobDetails, upsertJobDetails } from "@/lib/job-details";
import { getJobByPrimaryId, queryJobs } from "@/lib/jobs";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/app/components/TopBar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function asNumber(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s || !s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function formatDhakaDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export default async function GovtJobDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orgId } = await params;
  const sp = await searchParams;

  const orgIdNum = asNumber(orgId);
  const jobPrimaryId = asNumber(sp.jobId);
  if (!orgIdNum || !jobPrimaryId) notFound();

  const job = getJobByPrimaryId(jobPrimaryId);
  if (!job) {
    // If user hits a deep link before syncing, try a live fetch (best effort).
    // If that also fails, render 404.
    let live: GovtJobPublicDetails;
    try {
      live = await fetchGovtJobPublicDetails(jobPrimaryId);
      upsertJobDetails({
        jobPrimaryId,
        jobType: 1,
        details: live,
        fetchedAt: new Date().toISOString(),
        advertisementFile: live.advertisement_file ?? null,
        advertisementNo: live.advertisement_no ?? null,
        advertisementPublishedDate: live.advertisement_published_date ?? null,
        applicationSite: live.application_site ?? null,
        jobSource: live.job_source ?? null,
        minAge: live.min_age ?? null,
        maxAge: live.max_age ?? null,
        gender: live.gender ?? null,
        viewCount: live.view_count ?? null,
      });
    } catch {
      notFound();
    }

    return (
      <div className="container">
        <h1>{live.job_title}</h1>
        <p className="muted">
          Sync jobs first to see the full mirrored experience.
        </p>
      </div>
    );
  }

  if (job.organization_id !== orgIdNum) {
    // Keep URLs consistent. The DB is the source of truth for orgId.
    notFound();
  }

  const cached = getJobDetails(jobPrimaryId);
  let details: GovtJobPublicDetails | null = null;
  if (cached?.details && typeof cached.details === "object") {
    details = cached.details as GovtJobPublicDetails;
  } else {
    try {
      const live = await fetchGovtJobPublicDetails(jobPrimaryId);
      details = live;
      upsertJobDetails({
        jobPrimaryId,
        jobType: 1,
        details: live,
        fetchedAt: new Date().toISOString(),
        advertisementFile: live.advertisement_file ?? null,
        advertisementNo: live.advertisement_no ?? null,
        advertisementPublishedDate: live.advertisement_published_date ?? null,
        applicationSite: live.application_site ?? null,
        jobSource: live.job_source ?? null,
        minAge: live.min_age ?? null,
        maxAge: live.max_age ?? null,
        gender: live.gender ?? null,
        viewCount: live.view_count ?? null,
      });
    } catch {
      // Remote may be down. Render with DB-only info.
      details = null;
    }
  }

  const title = details?.job_title ?? job.job_title;
  const orgName = details?.job_utilities_govtorganization?.name ?? job.org_name;
  const applyUrl = details?.application_site ?? job.application_site_url;

  const pdfFile = details?.advertisement_file ?? cached?.advertisement_file ?? null;
  const pdfUrl = pdfFile ? alljobsMediaUrl(pdfFile) : null;

  const related = queryJobs({
    organizationId: job.organization_id,
    limit: 10,
    page: 1,
    sort: "published",
  }).items.filter((j) => j.job_primary_id !== jobPrimaryId);

  return (
    <>
      <TopBar
        right={
          <Link className="btnSmall" href="/jobs">
            Back
          </Link>
        }
      />
      <div className="container">
        <div className="panel detailHero">
          <div className="detailHeroLeft">
            <div className="orgLogo" aria-hidden="true">
              {job.logo_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="orgLogoImg"
                  src={alljobsMediaUrl(job.logo_path)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="orgLogoFallback">AJ</div>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                Government job
              </div>
              <h1 className="pageTitle" style={{ fontSize: 26 }}>
                {title}
              </h1>
              <div className="muted" style={{ marginTop: 6 }}>
                {orgName} <span className="dot" aria-hidden="true" />{" "}
                <b>{details?.job_id ?? job.job_id}</b>
              </div>
            </div>
          </div>
          <div className="detailHeroRight">
            {pdfUrl ? (
              <a className="btn" href={pdfUrl} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            ) : null}
            <a className="btnPrimary" href={applyUrl} target="_blank" rel="noreferrer">
              Apply now
            </a>
          </div>
        </div>

        <div className="detailGrid" style={{ marginTop: 12 }}>
          <aside>
            <div className="panel">
              <div className="panelTitle">
                More from {job.short_name ?? "this org"}
              </div>
              <div className="sideList">
                {related.length ? (
                  related.map((j) => (
                    <Link
                      key={j.job_primary_id}
                      className="sideItem"
                      href={`/jobs/government/${j.organization_id}?jobId=${j.job_primary_id}`}
                    >
                      <div className="sideTitle">{j.job_title}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {j.job_id}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="muted">No other jobs found.</div>
                )}
              </div>
            </div>
          </aside>

          <main>
            <div className="panel">
              <div className="detailFacts">
                <div>
                  <div className="factLabel">Vacancy</div>
                  <div className="factVal">{details?.vacancy ?? job.vacancy}</div>
                </div>
                <div>
                  <div className="factLabel">Application Start</div>
                  <div className="factVal">
                    {formatDhakaDateTime(details?.published_date ?? job.published_at)}
                  </div>
                </div>
                <div>
                  <div className="factLabel">Application End</div>
                  <div className="factVal">
                    {formatDhakaDateTime(details?.deadline_date ?? job.deadline_at)}
                  </div>
                </div>
                <div>
                  <div className="factLabel">ADV No</div>
                  <div className="factVal">
                    {details?.advertisement_no ?? cached?.advertisement_no ?? "-"}
                  </div>
                </div>
                <div>
                  <div className="factLabel">Viewed</div>
                  <div className="factVal">{details?.view_count ?? job.view_count}</div>
                </div>
                <div>
                  <div className="factLabel">Apply URL</div>
                  <div className="factVal" title={applyUrl}>
                    {applyUrl}
                  </div>
                </div>
              </div>
            </div>

            {pdfUrl ? (
              <div
                className="panel"
                style={{ marginTop: 12, padding: 0, overflow: "hidden" }}
              >
                <div className="pdfHeader">
                  <div style={{ fontWeight: 900, letterSpacing: "-0.02em" }}>
                    Advertisement
                  </div>
                  <a className="btnSmall" href={pdfUrl} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                </div>
                <iframe className="pdfFrame" src={pdfUrl} title="Advertisement PDF" />
              </div>
            ) : (
              <div className="muted" style={{ marginTop: 12 }}>
                No advertisement file found.
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
