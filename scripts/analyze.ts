// Analyzes people whose scraped sources are in the db but who have no profile yet.
//   npm run analyze              (everyone in "analyzing", 4 at a time)
//   npm run analyze -- <id> ...  (specific people, regardless of status)
//   npm run analyze -- --failed  (also retry people in "failed" that have both sources)
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const CONCURRENCY = 4;

async function main() {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("../lib/db");
  const { people } = await import("../lib/schema");
  const { analyzeAndStore } = await import("../lib/analyze");

  const args = process.argv.slice(2);
  const ids = args.filter((a) => !a.startsWith("--"));
  const statuses = args.includes("--failed") ? (["analyzing", "failed"] as const) : (["analyzing"] as const);
  const targets = ids.length
    ? await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, ids))
    : await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.status, [...statuses]));

  console.log(`analyzing ${targets.length} people, ${CONCURRENCY} at a time`);
  let ok = 0, failed = 0;
  const queue = [...targets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const started = Date.now();
        try {
          const { dropped } = await analyzeAndStore(t.id);
          ok++;
          console.log(`ready   ${t.name} (${Math.round((Date.now() - started) / 1000)}s${dropped.length ? `, dropped ${dropped.length} ungrounded` : ""})`);
        } catch (err) {
          failed++;
          console.error(`FAILED  ${t.name}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }),
  );
  console.log(`\n${ok} ready, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
