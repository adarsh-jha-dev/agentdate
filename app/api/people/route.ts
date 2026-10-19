import { eq, or } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ingestPerson } from "@/lib/ingest";
import { people, sources } from "@/lib/schema";
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
    // Retrying a failed person: clear old sources so progress reflects this attempt.
    await db.delete(sources).where(eq(sources.personId, person.id));
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

  // Scraping + analysis take minutes; respond now and let the client poll GET /api/people/[id].
  after(() => ingestPerson(person.id, { instagram: ig.url, linkedin: linkedinUrl }, { keepName: !!parsed.data.name }));

  return NextResponse.json({ person }, { status: 202 });
}
