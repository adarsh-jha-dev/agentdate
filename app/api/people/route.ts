import { eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeAndStore } from "@/lib/analyze";
import { db } from "@/lib/db";
import { people, sources } from "@/lib/schema";
import { scrapeInstagram, scrapeLinkedIn } from "@/lib/scrape";
import { parseInstagramUrl, parseLinkedInUrl } from "@/lib/urls";

export const maxDuration = 300;

const body = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  linkedinUrl: z.string().refine((u) => parseLinkedInUrl(u), "must be a linkedin.com/in/<profile> URL"),
  instagramUrl: z.string().refine((u) => parseInstagramUrl(u), "must be an instagram.com/<username> URL"),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
  }
  const linkedinUrl = parseLinkedInUrl(parsed.data.linkedinUrl)!.url;
  const ig = parseInstagramUrl(parsed.data.instagramUrl)!;

  const existing = await db
    .select()
    .from(people)
    .where(or(eq(people.linkedinUrl, linkedinUrl), eq(people.instagramUrl, ig.url)));

  let person = existing[0];
  const sameRow = existing.length === 1 && person.linkedinUrl === linkedinUrl && person.instagramUrl === ig.url;
  if (existing.length > 0 && !(sameRow && person.status === "failed")) {
    // Already added (or one URL belongs to someone else). Failed rows with the same URLs are retried below.
    return NextResponse.json(
      { error: "person already exists", id: person.id, status: person.status },
      { status: 409 },
    );
  }

  if (person) {
    [person] = await db
      .update(people)
      .set({ status: "scraping", error: null })
      .where(eq(people.id, person.id))
      .returning();
  } else {
    try {
      [person] = await db
        .insert(people)
        .values({
          name: parsed.data.name ?? `@${ig.username}`,
          linkedinUrl,
          instagramUrl: ig.url,
          status: "scraping",
        })
        .returning();
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "person already exists" }, { status: 409 });
      }
      throw err;
    }
  }

  const [igResult, liResult] = await Promise.allSettled([scrapeInstagram(ig.url), scrapeLinkedIn(linkedinUrl)]);

  // Keep whatever succeeded so a retry has the raw data to look at.
  for (const [kind, result] of [["instagram", igResult], ["linkedin", liResult]] as const) {
    if (result.status !== "fulfilled") continue;
    const row = { raw: result.value.raw, normalized: result.value.normalized, scrapedAt: new Date() };
    await db
      .insert(sources)
      .values({ personId: person.id, kind, ...row })
      .onConflictDoUpdate({ target: [sources.personId, sources.kind], set: row });
  }

  if (igResult.status === "rejected" || liResult.status === "rejected") {
    const errors = [igResult, liResult]
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
    const [failed] = await db
      .update(people)
      .set({ status: "failed", error: errors.join("; ") })
      .where(eq(people.id, person.id))
      .returning();
    return NextResponse.json({ person: failed }, { status: 502 });
  }

  if (!parsed.data.name) {
    await db.update(people).set({ name: liResult.value.normalized.name }).where(eq(people.id, person.id));
  }

  try {
    const { person: ready, analysis } = await analyzeAndStore(person.id);
    return NextResponse.json({ person: ready, profile: analysis }, { status: 201 });
  } catch (err) {
    const [failed] = await db.select().from(people).where(eq(people.id, person.id));
    return NextResponse.json(
      { person: failed, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
