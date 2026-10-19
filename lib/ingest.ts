import { eq } from "drizzle-orm";
import { analyzeAndStore } from "./analyze";
import { db } from "./db";
import { people, sources } from "./schema";
import { scrapeInstagram, scrapeLinkedIn } from "./scrape";

// Full pipeline for one person: scrape both sources in parallel -> analyze.
// Never throws; the outcome is recorded on the person row (ready | failed).
export async function ingestPerson(
  personId: string,
  urls: { instagram: string; linkedin: string },
  opts: { keepName: boolean },
) {
  // Store each source as soon as it lands so progress is visible while the other is still running.
  const store = async <T extends { raw: unknown; normalized: unknown }>(
    kind: "instagram" | "linkedin",
    job: Promise<T>,
  ) => {
    const result = await job;
    const row = { raw: result.raw, normalized: result.normalized, scrapedAt: new Date() };
    await db
      .insert(sources)
      .values({ personId, kind, ...row })
      .onConflictDoUpdate({ target: [sources.personId, sources.kind], set: row });
    return result;
  };

  const [igResult, liResult] = await Promise.allSettled([
    store("instagram", scrapeInstagram(urls.instagram)),
    store("linkedin", scrapeLinkedIn(urls.linkedin)),
  ]);

  if (igResult.status === "rejected" || liResult.status === "rejected") {
    const errors = [igResult, liResult]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    await db.update(people).set({ status: "failed", error: errors.join("; ") }).where(eq(people.id, personId));
    return;
  }

  if (!opts.keepName) {
    await db.update(people).set({ name: liResult.value.normalized.name }).where(eq(people.id, personId));
  }

  try {
    await analyzeAndStore(personId);
  } catch {
    // analyzeAndStore already marked the person failed with the reason.
  }
}
