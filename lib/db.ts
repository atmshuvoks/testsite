import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

function findUp(startDir: string, fileName: string) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 25; i++) {
    if (fs.existsSync(path.join(dir, fileName))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Next dev/build may execute server components in worker processes where `process.cwd()`
// is not the project root, and `import.meta.url` may point into `.next/`.
// We find the project root by walking up until we hit `package.json`.
const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot =
  process.env.JOBMIRROR_APP_ROOT ??
  findUp(process.cwd(), "package.json") ??
  findUp(here, "package.json") ??
  path.join(here, "..");

const dataDir = path.join(appRoot, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const DB_PATH =
  process.env.JOBMIRROR_DB_PATH ?? path.join(dataDir, "jobs.db");

if (process.env.JOBMIRROR_DEBUG === "1") {
  console.log(`[jobmirror] cwd=${process.cwd()} appRoot=${appRoot} DB_PATH=${DB_PATH}`);
}

export const db = new DatabaseSync(DB_PATH);

// Schema is created lazily on first import so local dev "just works".
db.exec(`
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS jobs (
  job_primary_id INTEGER PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,

  job_title TEXT NOT NULL,
  job_title_bn TEXT,
  job_type INTEGER NOT NULL,
  vacancy TEXT NOT NULL,
  vacancy_not_specific INTEGER NOT NULL,
  application_site_url TEXT NOT NULL,

  published_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at_source TEXT NOT NULL,

  organization_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  recruiter_id INTEGER NOT NULL,

  job_location TEXT NOT NULL,
  salary INTEGER NOT NULL,
  view_count INTEGER NOT NULL,

  org_name TEXT NOT NULL,
  org_name_bn TEXT,
  short_name TEXT,
  logo_path TEXT,
  website TEXT,
  short_code TEXT,
  industry_type_id INTEGER,
  industry_title TEXT,

  is_active INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_active_deadline ON jobs(is_active, deadline_at);
CREATE INDEX IF NOT EXISTS idx_jobs_published ON jobs(published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_org_id ON jobs(organization_id);
CREATE INDEX IF NOT EXISTS idx_jobs_org_name ON jobs(org_name);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(job_type);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  fetched_jobs INTEGER NOT NULL DEFAULT 0,
  new_jobs INTEGER NOT NULL DEFAULT 0,
  updated_jobs INTEGER NOT NULL DEFAULT 0,
  expired_jobs INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS job_details (
  job_primary_id INTEGER PRIMARY KEY,
  job_type INTEGER NOT NULL,
  details_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,

  advertisement_file TEXT,
  advertisement_no TEXT,
  advertisement_published_date TEXT,
  application_site TEXT,
  job_source TEXT,

  min_age INTEGER,
  max_age INTEGER,
  gender INTEGER,
  view_count INTEGER,

  FOREIGN KEY (job_primary_id) REFERENCES jobs(job_primary_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_job_details_fetched_at ON job_details(fetched_at);
`);
