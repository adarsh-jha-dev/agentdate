import Link from "next/link";
import type { Side, Verdict } from "@/lib/date-events";
import { Avatar } from "./ui";

export type ChatTurn = { speaker: Side; text: string; typing?: boolean };
export type Party = { id: string; name: string };
export type DatePhase = "starting" | "talking" | "debriefing" | "done" | "failed";

export function DateChat({
  a,
  b,
  setting,
  turns,
  verdicts,
  phase,
  error,
  totalTurns = 8,
  toolbar,
}: {
  a: Party | null;
  b: Party | null;
  setting: string | null;
  turns: ChatTurn[];
  verdicts: { a: Verdict | null; b: Verdict | null };
  phase: DatePhase;
  error?: string | null;
  totalTurns?: number;
  toolbar?: React.ReactNode;
}) {
  const party = (s: Side) => (s === "a" ? a : b);
  const match = verdicts.a?.secondDate && verdicts.b?.secondDate;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="animate-rise flex items-center justify-center gap-4 sm:gap-8">
        <PartyBadge party={a} align="right" />
        <span className="font-display text-3xl italic text-accent">&amp;</span>
        <PartyBadge party={b} align="left" />
      </header>

      <div className="mt-6 rounded-2xl border border-line bg-surface-2 px-5 py-4 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">The setting</p>
        <p className="mt-1 font-display text-xl leading-snug">
          {setting ?? <span className="text-muted">Picking a spot they&apos;d both like…</span>}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <span>
          {phase === "done"
            ? "Date finished"
            : phase === "debriefing"
              ? "Agents are debriefing privately…"
              : phase === "failed"
                ? "Date failed"
                : `Turn ${Math.min(turns.length, totalTurns)} of ${totalTurns}`}
        </span>
        {toolbar}
      </div>

      <ol className="mt-4 space-y-4">
        {turns.map((t, i) => {
          const p = party(t.speaker);
          const left = t.speaker === "a";
          return (
            <li key={i} className={`animate-rise flex items-end gap-2.5 ${left ? "" : "flex-row-reverse"}`}>
              {p && <Avatar name={p.name} size={30} />}
              <div className={`max-w-[85%] sm:max-w-[75%] ${left ? "" : "text-right"}`}>
                <p className="mb-1 px-1 text-xs text-muted">{p?.name}&apos;s agent</p>
                <div
                  className={`inline-block whitespace-pre-line rounded-2xl px-4 py-2.5 text-left text-[15px] leading-relaxed ${
                    left ? "rounded-bl-md bg-surface border border-line" : "rounded-br-md bg-ink text-bg"
                  }`}
                >
                  {t.text}
                  {t.typing && (t.text ? <Caret /> : <Dots />)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {phase === "debriefing" && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm text-muted">
          <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Each agent is privately deciding whether {a?.name.split(" ")[0]} and {b?.name.split(" ")[0]} should meet again…
        </div>
      )}

      {error && <p className="mt-6 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}

      {(verdicts.a || verdicts.b) && (
        <section className="mt-10">
          {phase === "done" && (
            <p
              className={`animate-rise mb-5 text-center font-display text-4xl ${match ? "text-accent" : "text-muted"}`}
            >
              {match ? "It's a match." : "Not this time."}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <VerdictCard party={a} verdict={verdicts.a} />
            <VerdictCard party={b} verdict={verdicts.b} />
          </div>
        </section>
      )}
    </div>
  );
}

function PartyBadge({ party, align }: { party: Party | null; align: "left" | "right" }) {
  if (!party) return <div className="size-16 animate-pulse rounded-full bg-surface-2" />;
  return (
    <Link
      href={`/p/${party.id}`}
      className={`flex items-center gap-3 hover:opacity-80 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      <Avatar name={party.name} size={64} />
      <span className="font-display text-xl leading-tight sm:text-2xl">{party.name}</span>
    </Link>
  );
}

function VerdictCard({ party, verdict }: { party: Party | null; verdict: Verdict | null }) {
  if (!verdict) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">
        {party?.name.split(" ")[0]}&apos;s agent is still thinking…
      </div>
    );
  }
  return (
    <div className="animate-rise rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{party?.name}&apos;s agent</p>
          <p className="mt-1 font-display text-5xl tabular-nums">
            {verdict.score}
            <span className="text-xl text-muted">/100</span>
          </p>
        </div>
        <span
          className={`mt-1 rounded-full px-3 py-1 text-xs font-medium ${
            verdict.secondDate ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"
          }`}
        >
          {verdict.secondDate ? "♥ Second date" : "No second date"}
        </span>
      </div>
      <VerdictList title="What clicked" items={verdict.clicked} tone="ok" />
      <VerdictList title="Concerns" items={verdict.concerns} tone="bad" />
    </div>
  );
}

function VerdictList({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "bad" }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-muted">{title}</p>
      <ul className="space-y-1.5 text-sm leading-relaxed">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className={tone === "ok" ? "text-ok" : "text-bad"}>{tone === "ok" ? "+" : "–"}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Caret() {
  return <span className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 animate-pulse bg-current" />;
}

function Dots() {
  return (
    <span className="inline-flex gap-1 py-1">
      {[0, 150, 300].map((d) => (
        <span key={d} className="size-1.5 animate-bounce rounded-full bg-current opacity-60" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}
