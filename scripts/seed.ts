// Seeds the whole demo: people -> profiles -> prescores -> dates. Resumable: re-run it any time and
// it only does what is missing.
//
//   npm run db:seed                      everything
//   npm run db:seed -- --no-dates        people, profiles and prescores only
//   npm run db:seed -- --plan            show which dates would run, without running them
//   npm run db:seed -- --csv other.csv   a different people list
//
// People come from data/people.csv (name,linkedin_url,instagram_url). If fixtures/ig-batch.json and
// fixtures/li-batch.json hold already-scraped Apify output for someone, that is used instead of
// scraping again; anyone else is scraped live through Apify.
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";

config({ path: [".env.local", ".env"], quiet: true });

const CONCURRENCY = 4;
const TOP_N = 5;
const STALE_RUNNING_MS = 10 * 60 * 1000;

type Row = { name: string; linkedin_url: string; instagram_url: string };

function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = "", record: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { record.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field); field = "";
      if (record.some((f) => f.trim())) records.push(record);
      record = [];
    } else field += c;
  }
  record.push(field);
  if (record.some((f) => f.trim())) records.push(record);

  const [header, ...rows] = records;
  const col = (name: string) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === name);
    if (i < 0) throw new Error(`CSV is missing the "${name}" column`);
    return i;
  };
  const [n, li, ig] = [col("name"), col("linkedin_url"), col("instagram_url")];
  return rows.map((r) => ({ name: r[n]?.trim(), linkedin_url: r[li]?.trim(), instagram_url: r[ig]?.trim() }));
}

const readJson = <T>(path: string): T | null => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null);
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.includes("--csv") ? args[args.indexOf("--csv") + 1] : "data/people.csv";
  const withDates = !args.includes("--no-dates");
  const planOnly = args.includes("--plan");

  const { and, eq, lt, or } = await import("drizzle-orm");
  const { db } = await import("../lib/db");
  const { dates, people, prescores, sources } = await import("../lib/schema");
  const { analyzeAndStore } = await import("../lib/analyze");
  const { ingestPerson } = await import("../lib/ingest");
  const { normalizeInstagram, normalizeLinkedIn, assertUsableInstagram, assertUsableLinkedIn } = await import("../lib/scrape");
  const { parseInstagramUrl, parseLinkedInUrl } = await import("../lib/urls");
  const { prescorePerson, topMatches } = await import("../lib/prescore");
  const { runDate } = await import("../lib/dating");
  const { runPool } = await import("../lib/pool");

  const summary = {
    people: { total: 0, alreadyReady: 0, fromFixtures: 0, scraped: 0, analyzed: 0, failed: 0 },
    prescores: { scored: 0, skipped: 0, failed: 0 },
    dates: { planned: 0, alreadyDone: 0, ran: 0, failed: 0 },
  };
  const failures: string[] = [];

  // ---- 1. People: ingest + analyze -------------------------------------------------------------
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  summary.people.total = rows.length;
  console.log(`\n== people (${rows.length} in ${csvPath})`);

  // Already-scraped Apify output, if present (gitignored, so a fresh clone scrapes live).
  const igCache = new Map<string, unknown>();
  for (const i of readJson<{ username?: string }[]>("fixtures/ig-batch.json") ?? [])
    if (i.username) igCache.set(i.username.toLowerCase(), i);
  const liCache = new Map<string, unknown>();
  for (const i of readJson<{ publicIdentifier?: string; originalQuery?: { query?: string } }[]>("fixtures/li-batch.json") ?? []) {
    if (i.publicIdentifier) liCache.set(i.publicIdentifier.toLowerCase(), i);
    const q = i.originalQuery?.query && parseLinkedInUrl(i.originalQuery.query);
    if (q) liCache.set(q.slug, i);
  }

  await runPool(rows, CONCURRENCY, async (row) => {
    try {
      const ig = parseInstagramUrl(row.instagram_url ?? "");
      const li = parseLinkedInUrl(row.linkedin_url ?? "");
      if (!row.name || !ig || !li) throw new Error("invalid row (needs name, linkedin_url, instagram_url)");

      const [existing] = await db
        .select()
        .from(people)
        .where(or(eq(people.linkedinUrl, li.url), eq(people.instagramUrl, ig.url)));
      if (existing?.status === "ready") {
        summary.people.alreadyReady++;
        return;
      }

      const person =
        existing ??
        (await db
          .insert(people)
          .values({ name: row.name, linkedinUrl: li.url, instagramUrl: ig.url, status: "pending" })
          .returning())[0];

      const have = await db.select({ kind: sources.kind }).from(sources).where(eq(sources.personId, person.id));
      const hasBoth = have.some((s) => s.kind === "linkedin") && have.some((s) => s.kind === "instagram");

      if (!hasBoth) {
        const igRaw = igCache.get(ig.username);
        const liRaw = liCache.get(li.slug);
        if (igRaw && liRaw) {
          const igNorm = normalizeInstagram(igRaw);
          const liNorm = normalizeLinkedIn(liRaw);
          assertUsableInstagram(igNorm);
          assertUsableLinkedIn(liNorm, li.url);
          for (const [kind, raw, normalized] of [["instagram", igRaw, igNorm], ["linkedin", liRaw, liNorm]] as const) {
            await db
              .insert(sources)
              .values({ personId: person.id, kind, raw, normalized })
              .onConflictDoUpdate({ target: [sources.personId, sources.kind], set: { raw, normalized } });
          }
          summary.people.fromFixtures++;
        } else {
          // No cached data: scrape live. ingestPerson also analyzes and records ready/failed.
          console.log(`scrape  ${row.name} (no cached data, calling Apify)`);
          await db.update(people).set({ status: "scraping", error: null }).where(eq(people.id, person.id));
          await ingestPerson(person.id, { instagram: ig.url, linkedin: li.url }, { keepName: true });
          const [after] = await db.select().from(people).where(eq(people.id, person.id));
          if (after.status !== "ready") throw new Error(after.error ?? `ended as ${after.status}`);
          summary.people.scraped++;
          summary.people.analyzed++;
          console.log(`ready   ${row.name}`);
          return;
        }
      }

      await analyzeAndStore(person.id);
      summary.people.analyzed++;
      console.log(`ready   ${row.name}`);
    } catch (err) {
      summary.people.failed++;
      failures.push(`person ${row.name}: ${msg(err)}`);
      console.error(`FAILED  ${row.name}: ${msg(err)}`);
    }
  });

  // ---- 2. Prescores ------------------------------------------------------------------------------
  const ready = await db.select({ id: people.id, name: people.name }).from(people).where(eq(people.status, "ready"));
  console.log(`\n== prescores (${ready.length} ready people)`);
  const existingScores = await db.select({ aId: prescores.aId, bId: prescores.bId }).from(prescores);
  const readyIds = new Set(ready.map((p) => p.id));

  await runPool(ready, CONCURRENCY, async (p) => {
    const have = existingScores.filter((s) => s.aId === p.id && readyIds.has(s.bId)).length;
    if (have >= ready.length - 1) {
      summary.prescores.skipped++;
      return;
    }
    try {
      const { scored, candidates } = await prescorePerson(p.id);
      summary.prescores.scored++;
      console.log(`scored  ${p.name} (${scored}/${candidates})`);
    } catch (err) {
      summary.prescores.failed++;
      failures.push(`prescore ${p.name}: ${msg(err)}`);
      console.error(`FAILED  prescore ${p.name}: ${msg(err)}`);
    }
  });

  // ---- 3. Dates: each person's top N, A-B and B-A run once ----------------------------------------
  if (withDates) {
    // A crashed earlier run can leave dates stuck in "running"; mark them failed so the pair reruns.
    await db
      .update(dates)
      .set({ status: "failed" })
      .where(and(eq(dates.status, "running"), lt(dates.createdAt, new Date(Date.now() - STALE_RUNNING_MS))));

    const key = (x: string, y: string) => [x, y].sort().join(":");
    const pairs = new Map<string, [string, string]>();
    for (const p of ready) {
      for (const m of await topMatches(p.id, TOP_N)) {
        if (!readyIds.has(m.id)) continue;
        if (!pairs.has(key(p.id, m.id))) pairs.set(key(p.id, m.id), [p.id, m.id]);
      }
    }
    const done = new Set(
      (await db
        .select({ aId: dates.aId, bId: dates.bId })
        .from(dates)
        .where(eq(dates.status, "done")))
        .map((d) => key(d.aId, d.bId)),
    );
    const todo = [...pairs.entries()].filter(([k]) => !done.has(k)).map(([, pair]) => pair);
    summary.dates.planned = pairs.size;
    summary.dates.alreadyDone = pairs.size - todo.length;
    console.log(`\n== dates (${pairs.size} unique pairs, ${todo.length} to run, ${CONCURRENCY} at a time)`);

    const nameOf = (id: string) => ready.find((p) => p.id === id)?.name ?? id;
    if (planOnly) {
      for (const [a, b] of todo) console.log(`plan    ${nameOf(a)} & ${nameOf(b)}`);
      return;
    }
    await runPool(todo, CONCURRENCY, async ([a, b]) => {
      const started = Date.now();
      try {
        let verdicts = "";
        await runDate(a, b, (e) => {
          if (e.type === "debrief") verdicts += `${e.side}=${e.verdict.score}${e.verdict.secondDate ? "♥" : ""} `;
        });
        summary.dates.ran++;
        console.log(`date    ${nameOf(a)} & ${nameOf(b)}  ${verdicts.trim()}  (${Math.round((Date.now() - started) / 1000)}s)`);
      } catch (err) {
        summary.dates.failed++;
        failures.push(`date ${nameOf(a)} & ${nameOf(b)}: ${msg(err)}`);
        console.error(`FAILED  date ${nameOf(a)} & ${nameOf(b)}: ${msg(err)}`);
      }
    });
  }

  // ---- Summary ------------------------------------------------------------------------------------
  const s = summary;
  console.log(`
== summary
people    ${s.people.total} in csv · ${s.people.alreadyReady} already ready · ${s.people.fromFixtures} from cached scrapes · ${s.people.scraped} scraped live · ${s.people.analyzed} analyzed · ${s.people.failed} failed
prescores ${s.prescores.scored} scored · ${s.prescores.skipped} already done · ${s.prescores.failed} failed
dates     ${withDates ? `${s.dates.planned} pairs · ${s.dates.alreadyDone} already done · ${s.dates.ran} ran · ${s.dates.failed} failed` : "skipped (--no-dates)"}`);
  if (failures.length) {
    console.log(`\nfailures (re-run to retry):\n- ${failures.join("\n- ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
