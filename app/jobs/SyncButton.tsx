"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SyncResponse =
  | {
      ok: true;
      startedAt: string;
      fetchedJobs: number;
      newJobs: number;
      updatedJobs: number;
      expiredJobs: number;
    }
  | { ok: false; error: string };

export default function SyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>("");

  async function onClick() {
    setStatus("");
    const res = await fetch("/api/admin/sync", { method: "POST" });
    const data = (await res.json().catch(() => null)) as SyncResponse | null;
    if (!res.ok || !data) {
      setStatus(`Sync failed (${res.status})`);
      return;
    }
    if (!data.ok) {
      setStatus(`Sync failed: ${data.error}`);
      return;
    }
    setStatus(
      `Synced: fetched ${data.fetchedJobs}, new ${data.newJobs}, updated ${data.updatedJobs}, expired ${data.expiredJobs}`
    );
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="syncWrap">
      <button className="btnPrimary" type="button" onClick={onClick} disabled={isPending}>
        {isPending ? "Syncing..." : "Sync now"}
      </button>
      {status ? <div className="muted syncStatus">{status}</div> : null}
    </div>
  );
}
