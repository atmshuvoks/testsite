import fs from "node:fs";
import path from "node:path";

import {
  alljobsMediaUrl,
  fetchGovtJobPublicDetails,
  type GovtJobPublicDetails,
} from "@/lib/alljobs";
import { db } from "@/lib/db";
import { getJobDetails, upsertJobDetails } from "@/lib/job-details";
import type { JobRow } from "@/lib/jobs";

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function loadEnv() {
  // Keep it simple: scripts run in `web/`, so load `.env.local` there.
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const DHAKA_TZ = "Asia/Dhaka";

function formatDhakaDateTime(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
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

function getLastSyncFinishedAt() {
  const row = db
    .prepare("SELECT finished_at FROM sync_runs ORDER BY id DESC LIMIT 1")
    .get() as { finished_at: string | null } | undefined;
  return row?.finished_at ?? null;
}

function listActiveComputerJobs(limit: number) {
  const stmt = db.prepare(
    `
    SELECT * FROM jobs
    WHERE is_active = 1 AND job_title LIKE '%computer%'
    ORDER BY deadline_at ASC
    LIMIT ?
  `
  );
  return stmt.all(limit) as JobRow[];
}

function listActiveDataEntryJobs(limit: number) {
  const stmt = db.prepare(
    `
    SELECT * FROM jobs
    WHERE is_active = 1 AND (job_title LIKE '%data entry%' OR job_title LIKE '%data-entry%')
    ORDER BY deadline_at ASC
    LIMIT ?
  `
  );
  return stmt.all(limit) as JobRow[];
}

function listAllActiveJobs(limit: number) {
  const stmt = db.prepare(
    `
    SELECT * FROM jobs
    WHERE is_active = 1
    ORDER BY deadline_at ASC
    LIMIT ?
  `
  );
  return stmt.all(limit) as JobRow[];
}

function listExpiringJobs(days: number, limit: number) {
  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const stmt = db.prepare(
    `
    SELECT * FROM jobs
    WHERE is_active = 1
      AND deadline_at >= ?
      AND deadline_at <= ?
    ORDER BY deadline_at ASC
    LIMIT ?
  `
  );
  return stmt.all(now.toISOString(), futureDate.toISOString(), limit) as JobRow[];
}

async function ensureGovtDetails(jobPrimaryId: number) {
  const cached = getJobDetails(jobPrimaryId);
  if (cached?.details) return cached.details as GovtJobPublicDetails;

  const live = await fetchGovtJobPublicDetails(jobPrimaryId);
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
  return live;
}

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string; title?: string; username?: string };
    text?: string;
  };
};

async function tgCall<T>(
  token: string,
  method: string,
  params: Record<string, string>
) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Telegram ${method} failed: ${res.status} ${text}`.slice(0, 500));
  }
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} not ok: ${json.description ?? "unknown"}`);
  }
  return json.result as T;
}

async function tgSendMessage(token: string, chatId: number, html: string) {
  await tgCall(token, "sendMessage", {
    chat_id: String(chatId),
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: "true",
  });
}

function parseAllowedChatIds(raw: string | undefined) {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const ids = new Set<number>();
  for (const part of s.split(",").map((x) => x.trim()).filter(Boolean)) {
    const n = Number(part);
    if (Number.isFinite(n)) ids.add(n);
  }
  return ids.size ? ids : null;
}

function buildComputerJobsMessages(opts: {
  title: string;
  baseUrl: string;
  jobs: JobRow[];
  detailsById: Map<number, GovtJobPublicDetails>;
  lastSyncFinishedAt: string | null;
}) {
  const { title, baseUrl, jobs, detailsById, lastSyncFinishedAt } = opts;
  const headerLines: string[] = [];
  headerLines.push(`<b>${escapeHtml(title)}</b>: <b>${jobs.length}</b> active`);
  if (lastSyncFinishedAt) {
    headerLines.push(`Last sync: <code>${escapeHtml(formatDhakaDateTime(lastSyncFinishedAt))}</code>`);
  }
  headerLines.push("");

  const blocks: string[] = jobs.map((j, idx) => {
    const d = detailsById.get(j.job_primary_id) ?? null;
    const title = d?.job_title ?? j.job_title;
    const org = String(
      d?.job_utilities_govtorganization?.short_name ??
      d?.job_utilities_govtorganization?.name ??
      j.short_name ??
      j.org_name
    );

    const deadlineIso = d?.deadline_date ?? j.deadline_at;
    const left = daysLeft(deadlineIso);
    const leftLabel = left >= 0 ? `${left} days left` : "Expired";

    const vacancy = d?.vacancy ?? j.vacancy ?? "-";
    const viewed = d?.view_count ?? j.view_count ?? "-";

    const startIso = d?.published_date ?? j.published_at;
    const endIso = deadlineIso;
    const advNo = d?.advertisement_no ?? "-";

    const applyUrl = (d?.application_site ?? j.application_site_url) as string;
    const detailsUrl =
      j.job_type === 1
        ? `${baseUrl}/jobs/government/${j.organization_id}?jobId=${j.job_primary_id}`
        : `${baseUrl}/jobs/private/${j.recruiter_id}?jobId=${j.job_primary_id}`;

    const pdfUrl = d?.advertisement_file ? alljobsMediaUrl(d.advertisement_file) : null;

    const links: string[] = [];
    if (applyUrl) links.push(`<a href="${escapeHtml(applyUrl)}">Apply</a>`);
    links.push(`<a href="${escapeHtml(detailsUrl)}">Details</a>`);
    if (pdfUrl) links.push(`<a href="${escapeHtml(pdfUrl)}">PDF</a>`);

    const lines: string[] = [];
    lines.push(
      `<b>${idx + 1}) ${escapeHtml(title)}</b> <code>${escapeHtml(j.job_id)}</code>`
    );
    lines.push(`${escapeHtml(org)} | ${escapeHtml(leftLabel)} | Vacancy: <b>${escapeHtml(String(vacancy))}</b> | Viewed: <b>${escapeHtml(String(viewed))}</b>`);
    lines.push(`Start: <code>${escapeHtml(formatDhakaDateTime(startIso))}</code>`);
    lines.push(`End: <code>${escapeHtml(formatDhakaDateTime(endIso))}</code>`);
    lines.push(`ADV: <code>${escapeHtml(String(advNo))}</code>`);
    lines.push(links.join(" | "));
    return lines.join("\n");
  });

  // Telegram limit is 4096 chars; keep a safe margin.
  const maxLen = 3600;
  const messages: string[] = [];
  let cur = headerLines.join("\n");
  for (const b of blocks) {
    const next = cur ? `${cur}\n\n--------------------\n\n${b}` : b;
    if (next.length > maxLen) {
      if (cur.trim()) messages.push(cur);
      cur = `<b>${escapeHtml(title)} (cont.)</b>\n\n${b}`;
      continue;
    }
    cur = next;
  }
  if (cur.trim()) messages.push(cur);
  return messages;
}

async function handleComputerCommand(opts: {
  title: string;
  jobs: JobRow[];
  token: string;
  chatId: number;
  baseUrl: string;
}) {
  const { token, chatId, baseUrl, title, jobs } = opts;

  if (!jobs.length) {
    await tgSendMessage(token, chatId, `<b>${escapeHtml(title)}</b>: 0 active`);
    return;
  }

  const detailsById = new Map<number, GovtJobPublicDetails>();
  for (const j of jobs) {
    if (j.job_type !== 1) continue; // Govt details supported for now.
    try {
      const d = await ensureGovtDetails(j.job_primary_id);
      detailsById.set(j.job_primary_id, d);
    } catch {
      // If details fetch fails, we still send the list based on the local DB row.
    }
  }

  const lastSyncFinishedAt = getLastSyncFinishedAt();
  const msgs = buildComputerJobsMessages({
    title,
    baseUrl,
    jobs,
    detailsById,
    lastSyncFinishedAt,
  });
  for (const m of msgs) {
    await tgSendMessage(token, chatId, m);
  }
}

async function main() {
  loadEnv();

  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) {
    throw new Error(
      "Missing TELEGRAM_BOT_TOKEN. Put it in web/.env.local and re-run."
    );
  }

  const allowedChatIds = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  const defaultLimit = Math.min(
    100,
    Math.max(1, Number(process.env.COMPUTER_JOBS_LIMIT ?? "25"))
  );

  let offset = Number(process.env.TELEGRAM_UPDATE_OFFSET ?? "0") || 0;
  console.log(
    `[telegram-bot] polling started. baseUrl=${baseUrl} limit=${defaultLimit} allowedChats=${allowedChatIds ? Array.from(allowedChatIds).join(",") : "(any)"
    }`
  );

  while (true) {
    const updates = await tgCall<TgUpdate[]>(token, "getUpdates", {
      offset: String(offset),
      timeout: "30",
      allowed_updates: JSON.stringify(["message"]),
    });

    for (const u of updates) {
      offset = Math.max(offset, u.update_id + 1);
      const msg = u.message;
      if (!msg?.text) continue;

      const chatId = msg.chat.id;
      if (allowedChatIds && !allowedChatIds.has(chatId)) continue;

      const text = msg.text.trim();
      if (text === "/help" || text.startsWith("/help@")) {
        await tgSendMessage(
          token,
          chatId,
          [
            "<b>JobMirror bot</b>",
            "",
            "Commands:",
            "<code>/jobs</code> List all active jobs",
            "<code>/jobs 10</code> List first 10 jobs",
            "<code>/expiring</code> Jobs expiring in 7 days",
            "<code>/expiring 3</code> Jobs expiring in 3 days",
            "<code>/computer</code> List active computer jobs",
            "<code>/computer 10</code> List first 10",
            "<code>/dataentry</code> List active data entry jobs",
            "<code>/dataentry 10</code> List first 10",
            "<code>/chatid</code> Show this chat id",
          ].join("\n")
        );
        continue;
      }

      if (text === "/chatid" || text.startsWith("/chatid@")) {
        await tgSendMessage(token, chatId, `Chat ID: <code>${chatId}</code>`);
        continue;
      }

      if (text.startsWith("/computer")) {
        const m = text.split(/\s+/);
        const nRaw = m[1] ?? "";
        const n = nRaw ? Number(nRaw) : defaultLimit;
        const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : defaultLimit;
        await handleComputerCommand({
          title: "Computer jobs",
          jobs: listActiveComputerJobs(limit),
          token,
          chatId,
          baseUrl,
        });
      }

      if (text.startsWith("/dataentry")) {
        const m = text.split(/\s+/);
        const nRaw = m[1] ?? "";
        const n = nRaw ? Number(nRaw) : defaultLimit;
        const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : defaultLimit;
        await handleComputerCommand({
          title: "Data entry jobs",
          jobs: listActiveDataEntryJobs(limit),
          token,
          chatId,
          baseUrl,
        });
      }

      if (text.startsWith("/jobs")) {
        const m = text.split(/\s+/);
        const nRaw = m[1] ?? "";
        const n = nRaw ? Number(nRaw) : defaultLimit;
        const limit = Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : defaultLimit;
        await handleComputerCommand({
          title: "All jobs",
          jobs: listAllActiveJobs(limit),
          token,
          chatId,
          baseUrl,
        });
      }

      if (text.startsWith("/expiring")) {
        const m = text.split(/\s+/);
        const daysRaw = m[1] ?? "";
        const days = daysRaw ? Number(daysRaw) : 7;
        const validDays = Number.isFinite(days) && days > 0 ? Math.min(30, days) : 7;
        await handleComputerCommand({
          title: `Jobs expiring in ${validDays} days`,
          jobs: listExpiringJobs(validDays, 50),
          token,
          chatId,
          baseUrl,
        });
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
