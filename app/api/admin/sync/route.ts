import { syncAlljobs } from "@/lib/sync";
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

  const startedAt = new Date().toISOString();
  const result = await syncAlljobs();
  return NextResponse.json({ ok: true, startedAt, ...result });
}

export async function POST(req: Request) {
  return GET(req);
}
