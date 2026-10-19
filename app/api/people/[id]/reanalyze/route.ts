import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeAndStore } from "@/lib/analyze";
import { db } from "@/lib/db";
import { people } from "@/lib/schema";

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const [person] = await db.select().from(people).where(eq(people.id, id));
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (person.status === "scraping") {
    return NextResponse.json({ error: "still scraping", status: person.status }, { status: 409 });
  }

  try {
    const { person: ready, analysis, dropped } = await analyzeAndStore(id);
    return NextResponse.json({ person: ready, profile: analysis, dropped });
  } catch (err) {
    const [failed] = await db.select().from(people).where(eq(people.id, id));
    return NextResponse.json(
      { person: failed, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
