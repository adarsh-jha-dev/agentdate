import Link from "next/link";
import { z } from "zod";
import { BestCouples } from "@/components/BestCouples";
import { PersonPicker } from "@/components/PersonPicker";
import { Avatar } from "@/components/ui";
import { readyPeopleNames } from "@/lib/queries";
import { bestCouples, rankFor, type RankedCandidate } from "@/lib/rank";

export const dynamic = "force-dynamic";

export default async function RankingsPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  const selectedId = z.uuid().safeParse(person).success ? person! : null;
  const [people, couples, ranked] = await Promise.all([
    readyPeopleNames(),
    bestCouples(10),
    selectedId ? rankFor(selectedId) : Promise.resolve(null),
  ]);
  const selected = people.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-5xl">Rankings</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Final score = 25% prescore + 75% mutual score. Mutual is the harmonic mean of both agents&apos; verdicts,
          so one-sided interest ranks low. People who have been on a date rank above those who haven&apos;t; the
          rest are ordered by prescore alone.
        </p>
      </div>

      <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-3xl">
            {selected ? <>Best fits for {selected.name}</> : "Ranking for one person"}
          </h2>
          <PersonPicker people={people} selected={selectedId} basePath="/rankings" />
        </div>
        {!selected ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
            Choose someone to see everyone ranked for them.
          </div>
        ) : ranked && ranked.length > 0 ? (
          <RankedList personName={selected.name} personId={selected.id} rows={ranked} />
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
            Nothing to rank yet.{" "}
            <Link href={`/p/${selected.id}`} className="text-accent hover:underline">
              Open {selected.name.split(" ")[0]}&apos;s profile and press “Find matches” →
            </Link>
          </div>
        )}
      </section>

      <BestCouples couples={couples} />
    </div>
  );
}

function RankedList({ personName, personId, rows }: { personName: string; personId: string; rows: RankedCandidate[] }) {
  const first = personName.split(" ")[0];
  return (
    <ol className="overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => (
        <li key={r.id} className={`border-b border-line last:border-0 ${r.dated ? "" : "bg-surface-2/40"}`}>
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className={`w-8 shrink-0 font-display text-3xl tabular-nums ${r.rank <= 3 ? "text-accent" : "text-muted"}`}>
                {r.rank}
              </span>
              <Avatar name={r.name} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={`/p/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                {r.why && <p className="truncate text-sm text-muted" title={r.why}>{r.why}</p>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 pl-12 sm:pl-0">
              {r.dated ? (
                <>
                  <AgentScore label={`${first}'s agent`} score={r.myScore} yes={r.mySecondDate} />
                  <AgentScore label={`${r.name.split(" ")[0]}'s agent`} score={r.theirScore} yes={r.theirSecondDate} />
                  <Link href={`/dates/${r.dateId}`} className="text-sm font-medium text-accent hover:underline">
                    Transcript →
                  </Link>
                </>
              ) : (
                <>
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-muted">Not dated yet</span>
                  <Link href={`/dates/new?a=${personId}&b=${r.id}`} className="text-sm font-medium text-accent hover:underline">
                    Send on a date →
                  </Link>
                </>
              )}
              <span className="w-12 text-right font-display text-3xl tabular-nums" title={`Prescore ${r.prescore ?? "–"}${r.mutual != null ? `, mutual ${Math.round(r.mutual)}` : ""}`}>
                {Math.round(r.finalScore)}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AgentScore({ label, score, yes }: { label: string; score: number | null; yes: boolean | null }) {
  return (
    <span className="text-xs">
      <span className="block text-muted">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="tabular-nums text-sm">{score ?? "–"}</span>
        {yes != null && (
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${yes ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"}`}>
            {yes ? "♥ 2nd date" : "no 2nd"}
          </span>
        )}
      </span>
    </span>
  );
}
