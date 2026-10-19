import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { prescorePerson, topMatches } from "@/lib/prescore";
import { people } from "@/lib/schema";
import { isReadOnly, readOnlyResponse } from "@/lib/readonly";

export const maxDuration = 300;

// Prescores this person against everyone ready and returns the top 5 candidates.
// The client then starts dates with them (POST /api/dates).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isReadOnly()) return readOnlyResponse();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const [person] = await db.select({ status: people.status }).from(people).where(eq(people.id, id));
  if (!person) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (person.status !== "ready") {
    return NextResponse.json({ error: `person is ${person.status}, not ready` }, { status: 409 });
  }

  try {
    const { scored, candidates } = await prescorePerson(id);
    const top = await topMatches(id, 5);
    return NextResponse.json({ scored, candidates, top });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
