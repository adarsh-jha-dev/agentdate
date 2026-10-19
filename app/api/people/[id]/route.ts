import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { people, profiles, sources } from "@/lib/schema";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const [person] = await db.select().from(people).where(eq(people.id, id));
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [[profile], scraped] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.personId, id)),
    db.select({ kind: sources.kind }).from(sources).where(eq(sources.personId, id)),
  ]);
  return NextResponse.json({
    person,
    status: person.status,
    sources: {
      linkedin: scraped.some((s) => s.kind === "linkedin"),
      instagram: scraped.some((s) => s.kind === "instagram"),
    },
    profile: profile ?? null,
  });
}
