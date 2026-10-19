import Link from "next/link";
import { BestCouples } from "@/components/BestCouples";
import { DateList } from "@/components/DateList";
import { PeopleGrid } from "@/components/PeopleGrid";
import { Avatar } from "@/components/ui";
import { listDates, listPeople } from "@/lib/queries";
import { bestCouples, loadRankingData, rankFromData } from "@/lib/rank";

export const dynamic = "force-dynamic";

const sections = [
  { id: "couples", label: "Best couples" },
  { id: "rankings", label: "Rankings" },
  { id: "profiles", label: "Profiles" },
  { id: "dates", label: "Dates" },
];

export default async function DemoPage() {
  const [all, allDates, couples, rankingData] = await Promise.all([
    listPeople(),
    listDates(),
    bestCouples(10),
    loadRankingData(),
  ]);
  const ready = all.filter((p) => p.status === "ready");
  const done = allDates.filter((d) => d.status === "done");
  const matches = done.filter((d) => d.a.secondDate && d.b.secondDate).length;
  const tops = ready.map((p) => ({ person: p, top: rankFromData(p.id, rankingData).slice(0, 3) }));

  return (
    <div className="space-y-14">
      <header className="animate-rise">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          Seeded example · nothing to enter
        </p>
        <h1 className="font-display text-5xl leading-tight sm:text-6xl">
          {ready.length} people. <span className="italic text-accent">{done.length} agent dates.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Every profile below was built only from public LinkedIn and Instagram data, every trait backed by a quote.
          Their agents went on dates with each person&apos;s top matches and privately debriefed. Click anything.
        </p>
        <dl className="mt-8 grid max-w-xl grid-cols-3 gap-3">
          <Stat label="Profiles" value={ready.length} />
          <Stat label="Dates" value={done.length} />
          <Stat label="Mutual matches" value={matches} />
        </dl>
        <nav className="mt-8 flex flex-wrap gap-2 text-sm">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line px-3 py-1.5 text-muted transition hover:border-muted/40 hover:text-ink">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <section id="couples" className="scroll-mt-20">
        <BestCouples couples={couples} />
      </section>

      <section id="rankings" className="scroll-mt-20">
        <SectionTitle title="Rankings" note="Each person's top 3. ♥ = both agents wanted a second date." />
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {tops.map(({ person, top }) => (
            <li key={person.id} className="flex flex-col gap-3 px-5 py-3.5 lg:flex-row lg:items-center">
              <Link href={`/p/${person.id}`} className="flex min-w-0 items-center gap-3 hover:opacity-80 lg:w-60">
                <Avatar name={person.name} size={32} />
                <span className="truncate font-medium">{person.name}</span>
              </Link>
              <ol className="flex min-w-0 flex-1 flex-wrap gap-2">
                {top.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={r.dateId ? `/dates/${r.dateId}` : `/p/${r.id}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition hover:border-muted/40 ${
                        r.dated ? "border-line bg-surface-2" : "border-dashed border-line text-muted"
                      }`}
                      title={r.dated ? "Open the date transcript" : "Not dated yet: ranked on prescore"}
                    >
                      <span className="text-xs text-muted">#{r.rank}</span>
                      {r.name}
                      <span className="tabular-nums text-muted">{Math.round(r.finalScore)}</span>
                      {r.mySecondDate && r.theirSecondDate && <span className="text-accent">♥</span>}
                    </Link>
                  </li>
                ))}
                {top.length === 0 && <li className="text-sm italic text-muted">Not ranked yet</li>}
              </ol>
              <Link href={`/rankings?person=${person.id}`} className="shrink-0 text-sm font-medium text-accent hover:underline">
                Full ranking →
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section id="profiles" className="scroll-mt-20">
        <SectionTitle title="Profiles" note="Built by the analysis agent from LinkedIn + Instagram only." />
        <PeopleGrid all={all} />
      </section>

      <section id="dates" className="scroll-mt-20">
        <SectionTitle title="Dates" note="8 turns each, then two private debriefs." />
        {allDates.length ? <DateList all={allDates} /> : <p className="italic text-muted">No dates yet. Run npm run db:seed.</p>}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="font-display text-4xl tabular-nums">{value}</dd>
    </div>
  );
}

function SectionTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-3xl">{title}</h2>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}
