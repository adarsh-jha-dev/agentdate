// Seeds people + sources from already-scraped Apify output in fixtures/. Never calls Apify.
//   npm run db:seed
// Expects fixtures/people.json ([{ name, instagram_url, linkedin_url }]) plus
// fixtures/ig-batch.json and fixtures/li-batch.json (raw dataset items from the two actors).
// People that already exist (by either URL) are skipped, so it is safe to re-run.
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: [".env.local", ".env"], quiet: true });

type SeedPerson = { name: string; instagram_url: string; linkedin_url: string };
type IgItem = { username?: string };
type LiItem = { publicIdentifier?: string; originalQuery?: { query?: string } };

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8"));

async function main() {
  const { eq, or } = await import("drizzle-orm");
  const { db } = await import("../lib/db");
  const { people, sources } = await import("../lib/schema");
  const { normalizeInstagram, normalizeLinkedIn, assertUsableInstagram, assertUsableLinkedIn } = await import("../lib/scrape");
  const { parseInstagramUrl, parseLinkedInUrl } = await import("../lib/urls");

  const seedPeople = readJson<SeedPerson[]>("fixtures/people.json");
  const igItems = readJson<IgItem[]>("fixtures/ig-batch.json");
  const liItems = readJson<LiItem[]>("fixtures/li-batch.json");

  const igByUsername = new Map(igItems.map((i) => [i.username?.toLowerCase(), i]));
  // LinkedIn redirects some slugs to a different publicIdentifier, so index by both.
  const liBySlug = new Map<string, LiItem>();
  for (const item of liItems) {
    if (item.publicIdentifier) liBySlug.set(item.publicIdentifier.toLowerCase(), item);
    const queried = item.originalQuery?.query && parseLinkedInUrl(item.originalQuery.query);
    if (queried) liBySlug.set(queried.slug, item);
  }

  let inserted = 0, skipped = 0, failed = 0;
  for (const p of seedPeople) {
    const ig = parseInstagramUrl(p.instagram_url);
    const li = parseLinkedInUrl(p.linkedin_url);
    try {
      if (!ig || !li) throw new Error("invalid URL in people.json");
      const igRaw = igByUsername.get(ig.username);
      const liRaw = liBySlug.get(li.slug);
      if (!igRaw) throw new Error(`no Instagram data for @${ig.username} in ig-batch.json`);
      if (!liRaw) throw new Error(`no LinkedIn data for ${li.url} in li-batch.json`);

      const igNorm = normalizeInstagram(igRaw);
      const liNorm = normalizeLinkedIn(liRaw);
      assertUsableInstagram(igNorm);
      assertUsableLinkedIn(liNorm, li.url);

      const existing = await db
        .select({ id: people.id })
        .from(people)
        .where(or(eq(people.linkedinUrl, li.url), eq(people.instagramUrl, ig.url)));
      if (existing.length > 0) {
        console.log(`skip    ${p.name} (already in db)`);
        skipped++;
        continue;
      }

      const [person] = await db
        .insert(people)
        .values({ name: p.name, linkedinUrl: li.url, instagramUrl: ig.url, status: "analyzing" })
        .returning({ id: people.id });
      await db.insert(sources).values([
        { personId: person.id, kind: "instagram", raw: igRaw, normalized: igNorm },
        { personId: person.id, kind: "linkedin", raw: liRaw, normalized: liNorm },
      ]);
      console.log(`insert  ${p.name}`);
      inserted++;
    } catch (err) {
      console.error(`FAILED  ${p.name}: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\n${inserted} inserted, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
