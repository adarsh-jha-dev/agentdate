import { desc, eq, inArray, or } from "drizzle-orm";
import type { Analysis } from "./analyze";
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
      .where(or(eq(prescores.aId, id), eq(prescores.bId, id)))
      .orderBy(desc(prescores.score))
      .limit(5),
    db
      .select()
      .from(dates)
      .where(or(eq(dates.aId, id), eq(dates.bId, id)))
      .orderBy(desc(dates.createdAt)),
  ]);

  const otherIds = [
    ...scoreRows.map((s) => (s.aId === id ? s.bId : s.aId)),
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
    matches: scoreRows.map((s) => {
      const otherId = s.aId === id ? s.bId : s.aId;
      return { id: otherId, name: nameOf(otherId), score: s.score, reason: s.reason };
    }),
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
  return rows.map((p) => {
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
