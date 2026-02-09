import { syncAlljobs } from "@/lib/sync";

async function main() {
  const watch = process.argv.includes("--watch");
  const intervalMin = Number(process.env.SYNC_INTERVAL_MINUTES ?? "30");

  async function runOnce() {
    const started = new Date();
    const r = await syncAlljobs();
    const ms = Date.now() - started.getTime();
    console.log(
      JSON.stringify(
        {
          at: new Date().toISOString(),
          ms,
          ...r,
        },
        null,
        2
      )
    );
  }

  await runOnce();

  if (!watch) return;

  const everyMs = Math.max(1, intervalMin) * 60 * 1000;
  console.log(`Watching: syncing every ${intervalMin} minutes`);

  while (true) {
    await new Promise((r) => setTimeout(r, everyMs));
    await runOnce();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
