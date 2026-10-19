import { desc, eq } from "drizzle-orm";
import type { Verdict } from "./date-events";
import { db } from "./db";
import { dates, people, prescores } from "./schema";

const PRESCORE_WEIGHT = 0.25;
const MUTUAL_WEIGHT = 0.75;

// Harmonic mean punishes one-sided interest: 90 & 30 -> 45, while 60 & 60 -> 60.
export function harmonicMean(x: number, y: number) {
  return x + y === 0 ? 0 : (2 * x * y) / (x + y);
}

export type RankedCandidate = {
  rank: number;
  id: string;
  name: string;
  finalScore: number;
  prescore: number | null;
  mutual: number | null;
  myScore: number | null; // this person's agent about the candidate
  theirScore: number | null; // the candidate's agent about this person
  mySecondDate: boolean | null;
  theirSecondDate: boolean | null;
  dated: boolean;
  dateId: string | null;
  why: string | null;
};

type DoneDate = typeof dates.$inferSelect;

// Latest finished date per pair, keyed by the other person's id.
function latestDatesFor(personId: string, rows: DoneDate[]) {
  const byOther = new Map<string, DoneDate>();
  for (const d of rows) {
    const other = d.aId === personId ? d.bId : d.aId;
    const prev = byOther.get(other);
    if (!prev || d.createdAt > prev.createdAt) byOther.set(other, d);
  }
  return byOther;
}

type RankingData = Awaited<ReturnType<typeof loadRankingData>>;

// Everything needed to rank anyone, in three queries.
export async function loadRankingData() {
  const [candidates, scoreRows, dateRows] = await Promise.all([
    db.select({ id: people.id, name: people.name }).from(people).where(eq(people.status, "ready")),
    db.select().from(prescores),
    db.select().from(dates).where(eq(dates.status, "done")),
  ]);
  return { candidates, scoreRows, dateRows };
}

export async function rankFor(personId: string): Promise<RankedCandidate[]> {
  return rankFromData(personId, await loadRankingData());
}

export function rankFromData(personId: string, { candidates, scoreRows, dateRows }: RankingData): RankedCandidate[] {
  const latest = latestDatesFor(
    personId,
    dateRows.filter((d) => d.aId === personId || d.bId === personId),
  );

  const ranked = candidates
    .filter((c) => c.id !== personId)
    .flatMap((c): Omit<RankedCandidate, "rank">[] => {
      // Prefer this person's own prescore of the candidate; fall back to the reverse direction.
      const pre =
        scoreRows.find((s) => s.aId === personId && s.bId === c.id) ??
        scoreRows.find((s) => s.aId === c.id && s.bId === personId);
      const d = latest.get(c.id);

      if (!d || d.aScore == null || d.bScore == null) {
        if (!pre) return []; // nothing to rank on yet
        return [{
          id: c.id, name: c.name, finalScore: pre.score, prescore: pre.score, mutual: null,
          myScore: null, theirScore: null, mySecondDate: null, theirSecondDate: null,
          dated: false, dateId: null, why: pre.reason,
        }];
      }

      const iAmA = d.aId === personId;
      const myScore = iAmA ? d.aScore : d.bScore;
      const theirScore = iAmA ? d.bScore : d.aScore;
      const myVerdict = (iAmA ? d.aVerdict : d.bVerdict) as Verdict | null;
      const theirVerdict = (iAmA ? d.bVerdict : d.aVerdict) as Verdict | null;
      const mutual = harmonicMean(myScore, theirScore);
      const finalScore = pre ? PRESCORE_WEIGHT * pre.score + MUTUAL_WEIGHT * mutual : mutual;
      const why =
        (myVerdict?.secondDate ? myVerdict.clicked[0] : myVerdict?.concerns[0]) ??
        myVerdict?.clicked[0] ??
        pre?.reason ??
        null;

      return [{
        id: c.id, name: c.name, finalScore, prescore: pre?.score ?? null, mutual,
        myScore, theirScore,
        mySecondDate: myVerdict?.secondDate ?? null, theirSecondDate: theirVerdict?.secondDate ?? null,
        dated: true, dateId: d.id, why,
      }];
    })
    .sort((x, y) => y.finalScore - x.finalScore || Number(y.dated) - Number(x.dated));

  return ranked.map((r, i) => ({ ...r, rank: i + 1 }));
}

export type Couple = {
  dateId: string;
  a: { id: string; name: string; score: number };
  b: { id: string; name: string; score: number };
  mutual: number;
  setting: string | null;
};

// Pairs where both agents want a second date, ranked by harmonic mean of their scores.
export async function bestCouples(limit = 10): Promise<Couple[]> {
  const [rows, names] = await Promise.all([
    db.select().from(dates).where(eq(dates.status, "done")).orderBy(desc(dates.createdAt)),
    db.select({ id: people.id, name: people.name }).from(people),
  ]);
  const nameOf = (id: string) => names.find((n) => n.id === id)?.name ?? "Unknown";

  const seen = new Set<string>();
  const couples: Couple[] = [];
  for (const d of rows) {
    const key = [d.aId, d.bId].sort().join(":");
    if (seen.has(key)) continue; // rows are newest first, so the first one per pair is the latest
    seen.add(key);
    const av = d.aVerdict as Verdict | null;
    const bv = d.bVerdict as Verdict | null;
    if (!av?.secondDate || !bv?.secondDate || d.aScore == null || d.bScore == null) continue;
    couples.push({
      dateId: d.id,
      a: { id: d.aId, name: nameOf(d.aId), score: d.aScore },
      b: { id: d.bId, name: nameOf(d.bId), score: d.bScore },
      mutual: harmonicMean(d.aScore, d.bScore),
      setting: d.setting,
    });
  }
  return couples.sort((x, y) => y.mutual - x.mutual).slice(0, limit);
}
