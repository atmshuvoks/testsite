import { db } from "@/lib/db";

export type JobDetailsRow = {
  job_primary_id: number;
  job_type: number;
  details_json: string;
  fetched_at: string;
  advertisement_file: string | null;
  advertisement_no: string | null;
  advertisement_published_date: string | null;
  application_site: string | null;
  job_source: string | null;
  min_age: number | null;
  max_age: number | null;
  gender: number | null;
  view_count: number | null;
};

export function getJobDetails(jobPrimaryId: number) {
  const stmt = db.prepare("SELECT * FROM job_details WHERE job_primary_id = ?");
  const row = stmt.get(jobPrimaryId) as JobDetailsRow | undefined;
  if (!row) return null;
  try {
    return {
      ...row,
      details: JSON.parse(row.details_json) as unknown,
    };
  } catch {
    return { ...row, details: null };
  }
}

export function upsertJobDetails(input: {
  jobPrimaryId: number;
  jobType: number;
  details: unknown;
  fetchedAt: string;
  advertisementFile?: string | null;
  advertisementNo?: string | null;
  advertisementPublishedDate?: string | null;
  applicationSite?: string | null;
  jobSource?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  gender?: number | null;
  viewCount?: number | null;
}) {
  const stmt = db.prepare(`
    INSERT INTO job_details (
      job_primary_id, job_type, details_json, fetched_at,
      advertisement_file, advertisement_no, advertisement_published_date,
      application_site, job_source,
      min_age, max_age, gender, view_count
    ) VALUES (
      @job_primary_id, @job_type, @details_json, @fetched_at,
      @advertisement_file, @advertisement_no, @advertisement_published_date,
      @application_site, @job_source,
      @min_age, @max_age, @gender, @view_count
    )
    ON CONFLICT(job_primary_id) DO UPDATE SET
      job_type=excluded.job_type,
      details_json=excluded.details_json,
      fetched_at=excluded.fetched_at,
      advertisement_file=excluded.advertisement_file,
      advertisement_no=excluded.advertisement_no,
      advertisement_published_date=excluded.advertisement_published_date,
      application_site=excluded.application_site,
      job_source=excluded.job_source,
      min_age=excluded.min_age,
      max_age=excluded.max_age,
      gender=excluded.gender,
      view_count=excluded.view_count
  `);

  stmt.run({
    job_primary_id: input.jobPrimaryId,
    job_type: input.jobType,
    details_json: JSON.stringify(input.details ?? null),
    fetched_at: input.fetchedAt,
    advertisement_file: input.advertisementFile ?? null,
    advertisement_no: input.advertisementNo ?? null,
    advertisement_published_date: input.advertisementPublishedDate ?? null,
    application_site: input.applicationSite ?? null,
    job_source: input.jobSource ?? null,
    min_age: input.minAge ?? null,
    max_age: input.maxAge ?? null,
    gender: input.gender ?? null,
    view_count: input.viewCount ?? null,
  });
}

