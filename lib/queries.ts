import { desc, eq, inArray, or } from "drizzle-orm";
import type { Analysis } from "./analyze";
import type { TranscriptTurn, Verdict } from "./date-events";
import { db } from "./db";
import { dates, people, prescores, profiles, sources } from "./schema";
import type { InstagramProfile, LinkedInProfile } from "./scrape";

export async function getPersonView(id: string) {
  const [person] = await db.select().from(people).where(eq(people.id, id));
  if (!person) return null;

  const [[profile], sourceRows, scoreRows, dateRows] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.personId, id)),
    db.select({ kind: sources.kind, normalized: sources.normalized, scrapedAt: sources.scrapedAt }).from(sources).where(eq(sources.personId, id)),
    db
      .select()
      .from(prescores)
      .where(eq(prescores.aId, id))
      .orderBy(desc(prescores.score))
      .limit(5),
    db
      .select()
      .from(dates)
      .where(or(eq(dates.aId, id), eq(dates.bId, id)))
      .orderBy(desc(dates.createdAt)),
  ]);

  const otherIds = [
    ...scoreRows.map((s) => s.bId),
    ...dateRows.map((d) => (d.aId === id ? d.bId : d.aId)),
  ];
  const others = otherIds.length
    ? await db.select({ id: people.id, name: people.name }).from(people).where(inArray(people.id, otherIds))
    : [];
  const nameOf = (pid: string) => others.find((o) => o.id === pid)?.name ?? "Unknown";

  const li = sourceRows.find((s) => s.kind === "linkedin");
  const ig = sourceRows.find((s) => s.kind === "instagram");

  return {
    person,
    analysis: (profile?.analysis as Analysis | undefined) ?? null,
    linkedin: (li?.normalized as LinkedInProfile | undefined) ?? null,
    instagram: (ig?.normalized as InstagramProfile | undefined) ?? null,
    matches: scoreRows.map((s) => ({ id: s.bId, name: nameOf(s.bId), score: s.score, reason: s.reason })),
    dates: dateRows.map((d) => {
      const otherId = d.aId === id ? d.bId : d.aId;
      return {
        id: d.id,
        otherId,
        otherName: nameOf(otherId),
        setting: d.setting,
        status: d.status,
        myScore: d.aId === id ? d.aScore : d.bScore,
        theirScore: d.aId === id ? d.bScore : d.aScore,
        createdAt: d.createdAt,
      };
    }),
  };
}
export type PersonView = NonNullable<Awaited<ReturnType<typeof getPersonView>>>;

export async function listPeople() {
  const [rows, profileRows, liRows] = await Promise.all([
    db.select().from(people).orderBy(desc(people.createdAt)),
    db.select({ personId: profiles.personId, analysis: profiles.analysis }).from(profiles),
    db.select({ personId: sources.personId, normalized: sources.normalized }).from(sources).where(eq(sources.kind, "linkedin")),
  ]);
  // Finished profiles first, then in-progress, then failed; newest first within each.
  const rank = { ready: 0, analyzing: 1, scraping: 1, pending: 1, failed: 2 } as const;
  const sorted = [...rows].sort((a, b) => rank[a.status] - rank[b.status]);
  return sorted.map((p) => {
    const analysis = profileRows.find((r) => r.personId === p.id)?.analysis as Analysis | undefined;
    const li = liRows.find((r) => r.personId === p.id)?.normalized as LinkedInProfile | undefined;
    return {
      ...p,
      headline: li?.headline ?? null,
      summary: analysis?.summary ?? null,
      interests: analysis ? [...analysis.interests, ...analysis.hobbies].slice(0, 4).map((t) => t.trait) : [],
    };
  });
}

export async function getDate(id: string) {
  const [d] = await db.select().from(dates).where(eq(dates.id, id));
  if (!d) return null;
  const names = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(inArray(people.id, [d.aId, d.bId]));
  const nameOf = (pid: string) => names.find((n) => n.id === pid)?.name ?? "Unknown";
  return {
    id: d.id,
    status: d.status,
    setting: d.setting,
    a: { id: d.aId, name: nameOf(d.aId) },
    b: { id: d.bId, name: nameOf(d.bId) },
    transcript: (d.transcript as TranscriptTurn[] | null) ?? [],
    aVerdict: (d.aVerdict as Verdict | null) ?? null,
    bVerdict: (d.bVerdict as Verdict | null) ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}
export type SavedDate = NonNullable<Awaited<ReturnType<typeof getDate>>>;

export async function listDates() {
  const [rows, names] = await Promise.all([
    db.select().from(dates).orderBy(desc(dates.createdAt)),
    db.select({ id: people.id, name: people.name }).from(people),
  ]);
  const nameOf = (pid: string) => names.find((n) => n.id === pid)?.name ?? "Unknown";
  return rows.map((d) => ({
    id: d.id,
    status: d.status,
    setting: d.setting,
    a: { id: d.aId, name: nameOf(d.aId), score: d.aScore, secondDate: (d.aVerdict as Verdict | null)?.secondDate ?? null },
    b: { id: d.bId, name: nameOf(d.bId), score: d.bScore, secondDate: (d.bVerdict as Verdict | null)?.secondDate ?? null },
    turns: ((d.transcript as TranscriptTurn[] | null) ?? []).length,
    createdAt: d.createdAt,
  }));
}

export async function readyPeopleNames() {
  return db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.status, "ready"))
    .orderBy(people.name);
}
