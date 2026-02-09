import { db } from "@/lib/db";

type SQLParam = string | number | bigint | null | Uint8Array;

export type JobRow = {
  job_primary_id: number;
  job_id: string;
  job_title: string;
  job_title_bn: string | null;
  job_type: number;
  vacancy: string;
  vacancy_not_specific: number;
  application_site_url: string;
  published_at: string;
  deadline_at: string;
  status: number;
  created_at_source: string;
  organization_id: number;
  category_id: number;
  recruiter_id: number;
  job_location: string;
  salary: number;
  view_count: number;
  org_name: string;
  org_name_bn: string | null;
  short_name: string | null;
  logo_path: string | null;
  website: string | null;
  short_code: string | null;
  industry_type_id: number | null;
  industry_title: string | null;
  is_active: number;
  first_seen_at: string;
  last_seen_at: string;
  last_changed_at: string;
};

export type JobsQuery = {
  page?: number;
  limit?: number;
  q?: string;
  jobType?: number;
  organizationId?: number;
  computerOnly?: boolean;
  dataEntryOnly?: boolean;
  activeOnly?: boolean;
  postedToday?: boolean;
  deadlineToday?: boolean;
  expiresInDays?: number;
  sort?: "deadline" | "published";
};

export function getJobByPrimaryId(jobPrimaryId: number) {
  const stmt = db.prepare("SELECT * FROM jobs WHERE job_primary_id = ?");
  return (stmt.get(jobPrimaryId) as JobRow | undefined) ?? null;
}

const DHAKA_TZ = "Asia/Dhaka";
const DHAKA_FIXED_OFFSET = "+06:00";

function dhakaYmd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dhakaDayRangeIso(d: Date) {
  const ymd = dhakaYmd(d); // YYYY-MM-DD
  const start = new Date(`${ymd}T00:00:00${DHAKA_FIXED_OFFSET}`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function queryJobs(input: JobsQuery) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 20)));
  const offset = (page - 1) * limit;

  const where: string[] = ["1=1"];
  const params: SQLParam[] = [];

  if (input.activeOnly ?? true) {
    where.push("is_active = 1");
  }

  if (input.computerOnly) {
    // Keep this simple and transparent: "computer" in the job title.
    // SQLite LIKE is case-insensitive for ASCII by default.
    where.push("job_title LIKE ?");
    params.push("%computer%");
  }

  if (input.dataEntryOnly) {
    // Common wording variations we care about.
    where.push("(job_title LIKE ? OR job_title LIKE ?)");
    params.push("%data entry%", "%data-entry%");
  }

  if (typeof input.jobType === "number" && Number.isFinite(input.jobType)) {
    where.push("job_type = ?");
    params.push(input.jobType);
  }

  if (
    typeof input.organizationId === "number" &&
    Number.isFinite(input.organizationId)
  ) {
    where.push("organization_id = ?");
    params.push(input.organizationId);
  }

  const q = (input.q ?? "").trim();
  if (q) {
    where.push(
      "(job_title LIKE ? OR org_name LIKE ? OR job_id LIKE ? OR IFNULL(short_name,'') LIKE ?)"
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const now = new Date();

  if (input.postedToday) {
    const { startIso, endIso } = dhakaDayRangeIso(now);
    where.push("published_at >= ? AND published_at < ?");
    params.push(startIso, endIso);
  }

  if (input.deadlineToday) {
    const { startIso, endIso } = dhakaDayRangeIso(now);
    where.push("deadline_at >= ? AND deadline_at < ?");
    params.push(startIso, endIso);
  }

  if (
    typeof input.expiresInDays === "number" &&
    Number.isFinite(input.expiresInDays) &&
    input.expiresInDays > 0
  ) {
    const end = new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000);
    where.push("deadline_at >= ? AND deadline_at <= ?");
    params.push(now.toISOString(), end.toISOString());
  }

  const orderBy =
    input.sort === "deadline"
      ? "deadline_at ASC"
      : input.sort === "published"
        ? "published_at DESC"
        : "published_at DESC";

  const whereSql = where.join(" AND ");

  const totalStmt = db.prepare(
    `SELECT COUNT(1) AS total FROM jobs WHERE ${whereSql}`
  );
  const totalRow = totalStmt.get(...params) as { total: number };
  const total = totalRow?.total ?? 0;

  const itemsStmt = db.prepare(
    `SELECT * FROM jobs WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`
  );
  const items = itemsStmt.all(...params, limit, offset) as JobRow[];

  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    items,
  };
}
