import { queryJobs } from "@/lib/jobs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;

  const page = Number(sp.get("page") ?? "1");
  const limit = Number(sp.get("limit") ?? "20");
  const q = sp.get("q") ?? "";

  const jobType = sp.get("jobType");
  const organizationId = sp.get("organizationId");
  const computerOnly = (sp.get("computerOnly") ?? "0") === "1";
  const dataEntryOnly = (sp.get("dataEntryOnly") ?? "0") === "1";

  const activeOnly = (sp.get("activeOnly") ?? "1") !== "0";
  const postedToday = (sp.get("postedToday") ?? "0") === "1";
  const deadlineToday = (sp.get("deadlineToday") ?? "0") === "1";
  const expiresInDays = sp.get("expiresInDays");
  const sortRaw = sp.get("sort") ?? "";
  const sort =
    sortRaw === "deadline" || sortRaw === "published" ? sortRaw : undefined;

  const result = queryJobs({
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
    q,
    jobType: jobType ? Number(jobType) : undefined,
    organizationId: organizationId ? Number(organizationId) : undefined,
    computerOnly,
    dataEntryOnly,
    activeOnly,
    postedToday,
    deadlineToday,
    expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
    sort,
  });

  return NextResponse.json({ ok: true, ...result });
}
