import { db } from "@/lib/db";
import type { JobRow } from "@/lib/jobs";

type AllJobsJob = {
  job_primary_id: number;
  job_title: string;
  job_title_bn?: string | null;
  job_id: string;
  job_type: number;
  vacancy: string;
  vacancy_not_specific: boolean;
  application_site_url: string;
  published_date: string;
  deadline_date: string;
  status: number;
  created_at: string;
  organization_id: number;
  category_id: number;
  recruiter_id: number;
  job_location: string;
  salary: number;
  view_count: number;
  org_name: string;
  org_name_bn?: string | null;
  short_name?: string | null;
  logo?: string | null;
  website?: string | null;
  short_code?: string | null;
  industry_type_id?: number | null;
  industry_title?: string | null;
};

type PublishedJobsResponse = {
  status: string;
  statusCode: number;
  count: number;
  totalPrivateJob: number;
  govtJobs: AllJobsJob[];
};

const ALLJOBS_BASE = "https://alljobs.teletalk.com.bd";
const SEARCH_ENDPOINT = `${ALLJOBS_BASE}/api/v1/published-jobs/search`;
const PAGE_LIMIT = 20;

function toIsoUtc(s: string) {
  // API returns ISO strings with Z; keep normalized.
  return new Date(s).toISOString();
}

function boolToInt(b: boolean) {
  return b ? 1 : 0;
}

export type SyncResult = {
  fetchedJobs: number;
  newJobs: number;
  updatedJobs: number;
  expiredJobs: number;
};

async function fetchPage(page: number) {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://alljobs.teletalk.com.bd/",
      "Origin": "https://alljobs.teletalk.com.bd",
    },
    signal: AbortSignal.timeout(25_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Alljobs fetch failed: ${res.status} ${res.statusText} ${text}`.slice(0, 400));
  }

  const json = (await res.json()) as PublishedJobsResponse;
  if (!json || !Array.isArray(json.govtJobs)) {
    throw new Error("Alljobs response shape unexpected");
  }
  return json;
}

type ComparableRow = Record<string, unknown>;

function hasImportantChanges(existing: ComparableRow, next: ComparableRow) {
  // Do not treat view_count as a "job changed" signal; it updates frequently.
  const fields = [
    "job_id",
    "job_title",
    "job_title_bn",
    "job_type",
    "vacancy",
    "vacancy_not_specific",
    "application_site_url",
    "published_at",
    "deadline_at",
    "status",
    "created_at_source",
    "organization_id",
    "category_id",
    "recruiter_id",
    "job_location",
    "salary",
    "org_name",
    "org_name_bn",
    "short_name",
    "logo_path",
    "website",
    "short_code",
    "industry_type_id",
    "industry_title",
  ];

  for (const f of fields) {
    if ((existing?.[f] ?? null) !== (next?.[f] ?? null)) return true;
  }
  return false;
}

export async function syncAlljobs(): Promise<SyncResult> {
  const startedAt = new Date().toISOString();

  const runInsert = db.prepare(
    "INSERT INTO sync_runs(started_at, ok) VALUES(?, 0)"
  );
  const runId = Number(runInsert.run(startedAt).lastInsertRowid);

  const result: SyncResult = {
    fetchedJobs: 0,
    newJobs: 0,
    updatedJobs: 0,
    expiredJobs: 0,
  };

  try {
    const first = await fetchPage(1);
    const total = typeof first.count === "number" ? first.count : first.govtJobs.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

    const all: AllJobsJob[] = [...first.govtJobs];
    for (let p = 2; p <= pages; p++) {
      const page = await fetchPage(p);
      all.push(...page.govtJobs);
    }

    result.fetchedJobs = all.length;

    const nowIso = new Date().toISOString();
    const seenIds: number[] = [];

    const selectExisting = db.prepare(
      "SELECT * FROM jobs WHERE job_primary_id = ?"
    );

    const insertJob = db.prepare(`
      INSERT INTO jobs (
        job_primary_id, job_id,
        job_title, job_title_bn, job_type, vacancy, vacancy_not_specific, application_site_url,
        published_at, deadline_at, status, created_at_source,
        organization_id, category_id, recruiter_id,
        job_location, salary, view_count,
        org_name, org_name_bn, short_name, logo_path, website, short_code, industry_type_id, industry_title,
        is_active, first_seen_at, last_seen_at, last_changed_at
      ) VALUES (
        @job_primary_id, @job_id,
        @job_title, @job_title_bn, @job_type, @vacancy, @vacancy_not_specific, @application_site_url,
        @published_at, @deadline_at, @status, @created_at_source,
        @organization_id, @category_id, @recruiter_id,
        @job_location, @salary, @view_count,
        @org_name, @org_name_bn, @short_name, @logo_path, @website, @short_code, @industry_type_id, @industry_title,
        1, @first_seen_at, @last_seen_at, @last_changed_at
      )
    `);

    const updateJobChanged = db.prepare(`
      UPDATE jobs SET
        job_id=@job_id,
        job_title=@job_title,
        job_title_bn=@job_title_bn,
        job_type=@job_type,
        vacancy=@vacancy,
        vacancy_not_specific=@vacancy_not_specific,
        application_site_url=@application_site_url,
        published_at=@published_at,
        deadline_at=@deadline_at,
        status=@status,
        created_at_source=@created_at_source,
        organization_id=@organization_id,
        category_id=@category_id,
        recruiter_id=@recruiter_id,
        job_location=@job_location,
        salary=@salary,
        view_count=@view_count,
        org_name=@org_name,
        org_name_bn=@org_name_bn,
        short_name=@short_name,
        logo_path=@logo_path,
        website=@website,
        short_code=@short_code,
        industry_type_id=@industry_type_id,
        industry_title=@industry_title,
        is_active=1,
        last_seen_at=@last_seen_at,
        last_changed_at=@last_changed_at
      WHERE job_primary_id=@job_primary_id
    `);

    const updateJobNoChange = db.prepare(`
      UPDATE jobs SET
        view_count=@view_count,
        is_active=1,
        last_seen_at=@last_seen_at
      WHERE job_primary_id=@job_primary_id
    `);

    db.exec("BEGIN IMMEDIATE");
    try {
      for (const j of all) {
        const id = j.job_primary_id;
        if (typeof id !== "number") continue;
        seenIds.push(id);

        const mapped = {
          job_primary_id: id,
          job_id: j.job_id,
          job_title: j.job_title,
          job_title_bn: j.job_title_bn ?? null,
          job_type: j.job_type,
          vacancy: String(j.vacancy ?? ""),
          vacancy_not_specific: boolToInt(!!j.vacancy_not_specific),
          application_site_url: j.application_site_url,
          published_at: toIsoUtc(j.published_date),
          deadline_at: toIsoUtc(j.deadline_date),
          status: j.status,
          created_at_source: toIsoUtc(j.created_at),
          organization_id: j.organization_id,
          category_id: j.category_id,
          recruiter_id: j.recruiter_id,
          job_location: j.job_location ?? "",
          salary: Number(j.salary ?? 0),
          view_count: Number(j.view_count ?? 0),
          org_name: j.org_name,
          org_name_bn: j.org_name_bn ?? null,
          short_name: j.short_name ?? null,
          logo_path: j.logo ?? null,
          website: j.website ?? null,
          short_code: j.short_code ?? null,
          industry_type_id: j.industry_type_id ?? null,
          industry_title: j.industry_title ?? null,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
          last_changed_at: nowIso,
        };

        const existing = selectExisting.get(id) as JobRow | undefined;
        if (!existing) {
          insertJob.run(mapped);
          result.newJobs += 1;
          continue;
        }

        // Preserve first_seen_at from the original row.
        mapped.first_seen_at = existing.first_seen_at ?? nowIso;

        if (hasImportantChanges(existing, mapped)) {
          updateJobChanged.run(mapped);
          result.updatedJobs += 1;
        } else {
          updateJobNoChange.run({
            job_primary_id: id,
            view_count: mapped.view_count,
            last_seen_at: nowIso,
          });
        }
      }

      if (seenIds.length > 0) {
        const placeholders = seenIds.map(() => "?").join(", ");
        const expireStmt = db.prepare(
          `UPDATE jobs SET is_active=0 WHERE is_active=1 AND job_primary_id NOT IN (${placeholders})`
        );
        const info = expireStmt.run(...seenIds) as { changes?: number };
        // node:sqlite returns { changes } for run() on UPDATE
        result.expiredJobs = Number(info?.changes ?? 0);
      }

      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    const finishedAt = new Date().toISOString();
    const runUpdate = db.prepare(
      "UPDATE sync_runs SET finished_at=?, ok=1, fetched_jobs=?, new_jobs=?, updated_jobs=?, expired_jobs=? WHERE id=?"
    );
    runUpdate.run(
      finishedAt,
      result.fetchedJobs,
      result.newJobs,
      result.updatedJobs,
      result.expiredJobs,
      runId
    );

    return result;
  } catch (err: unknown) {
    const finishedAt = new Date().toISOString();
    const msg = String(
      (err as { message?: unknown } | null)?.message ?? err ?? "Unknown error"
    ).slice(0, 2000);
    const runUpdate = db.prepare(
      "UPDATE sync_runs SET finished_at=?, ok=0, error=? WHERE id=?"
    );
    runUpdate.run(finishedAt, msg, runId);
    throw err;
  }
}
