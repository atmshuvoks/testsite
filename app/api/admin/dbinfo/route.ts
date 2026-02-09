import fs from "node:fs";
import path from "node:path";
import { DB_PATH, db } from "@/lib/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(req: Request) {
  const token = process.env.SYNC_TOKEN;
  if (!token) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-sync-token") === token;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const abs = path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(DB_PATH);
  const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
  const counts = db
    .prepare("SELECT COUNT(1) AS total, SUM(is_active) AS active FROM jobs")
    .get() as { total: number; active: number | null };
  type SyncRunRow = {
    id: number;
    started_at: string;
    finished_at: string | null;
    ok: number;
    fetched_jobs: number;
    new_jobs: number;
    updated_jobs: number;
    expired_jobs: number;
    error: string | null;
  } | null;

  const lastRun = db
    .prepare(
      "SELECT id, started_at, finished_at, ok, fetched_jobs, new_jobs, updated_jobs, expired_jobs, error FROM sync_runs ORDER BY id DESC LIMIT 1"
    )
    .get() as SyncRunRow;

  return NextResponse.json({
    ok: true,
    cwd: process.cwd(),
    dbPath: abs,
    exists: !!stat,
    size: stat?.size ?? 0,
    mtime: stat?.mtime?.toISOString?.() ?? null,
    counts,
    lastRun: lastRun ?? null,
  });
}
