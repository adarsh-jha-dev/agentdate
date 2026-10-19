import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { Analysis } from "./analyze";
import { db } from "./db";
import { profileDigest } from "./digest";
import { MODEL_FAST, structured } from "./llm";
import { people, prescores, profiles } from "./schema";

const BATCH_SIZE = 10;

const batchSchema = z.object({
  scores: z.array(
    z.object({
      key: z.string().describe("The candidate key, e.g. c3"),
      score: z.number().describe("0-100 compatibility"),
      reason: z.string().describe("One line, specific to these two people"),
    }),
  ),
});

const SYSTEM = `You are a matchmaker estimating romantic compatibility between one person and several candidates, using only their profiles.
Score each candidate 0-100 for how well they fit the person's needs, values, lifestyle and ideal partner, and vice versa.
Reward concrete overlaps (shared interests, compatible values and energy); penalize clashes with possible dealbreakers.
Use the full range; do not give everyone similar scores. Give a one-line reason naming the specific overlap or clash.
Return exactly one entry per candidate key.`;

type Candidate = { id: string; name: string; analysis: Analysis };

async function readyPeople() {
  return db
    .select({ id: people.id, name: people.name, analysis: profiles.analysis })
    .from(people)
    .innerJoin(profiles, eq(profiles.personId, people.id))
    .where(eq(people.status, "ready"));
}

async function scoreBatch(person: Candidate, batch: Candidate[]) {
  const keyed = batch.map((c, i) => ({ key: `c${i + 1}`, c }));
  const user = [
    `PERSON\n${profileDigest(person.name, person.analysis)}`,
    ...keyed.map(({ key, c }) => `CANDIDATE ${key}\n${profileDigest(c.name, c.analysis)}`),
  ].join("\n\n---\n\n");

  const { scores } = await structured(batchSchema, SYSTEM, user, MODEL_FAST);
  return scores.flatMap((s) => {
    const match = keyed.find((k) => k.key === s.key.trim().toLowerCase());
    if (!match) return [];
    return [{ id: match.c.id, score: Math.round(Math.min(100, Math.max(0, s.score))), reason: s.reason.trim() }];
  });
}

// Scores person A against every other ready person and stores the results.
export async function prescorePerson(personId: string) {
  const all = await readyPeople();
  const me = all.find((p) => p.id === personId);
  if (!me) throw new Error("person is not ready (no profile yet)");
  const person: Candidate = { ...me, analysis: me.analysis as Analysis };
  const others: Candidate[] = all
    .filter((p) => p.id !== personId)
    .map((p) => ({ ...p, analysis: p.analysis as Analysis }));

  const batches: Candidate[][] = [];
  for (let i = 0; i < others.length; i += BATCH_SIZE) batches.push(others.slice(i, i + BATCH_SIZE));
  const results = (await Promise.all(batches.map((b) => scoreBatch(person, b)))).flat();

  for (const r of results) {
    await db
      .insert(prescores)
      .values({ aId: personId, bId: r.id, score: r.score, reason: r.reason })
      .onConflictDoUpdate({
        target: [prescores.aId, prescores.bId],
        set: { score: r.score, reason: r.reason },
      });
  }
  return { scored: results.length, candidates: others.length };
}

export async function topMatches(personId: string, limit = 5) {
  return db
    .select({ id: people.id, name: people.name, score: prescores.score, reason: prescores.reason })
    .from(prescores)
    .innerJoin(people, eq(people.id, prescores.bId))
    .where(and(eq(prescores.aId, personId), ne(prescores.bId, personId)))
    .orderBy(desc(prescores.score))
    .limit(limit);
}
