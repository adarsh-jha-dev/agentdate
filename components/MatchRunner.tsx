"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readDateStream } from "@/lib/date-events";
import { applyDateEvent, initialLiveDate, TOTAL_TURNS, type LiveDate } from "./dateState";
import { Avatar } from "./ui";

const CONCURRENCY = 3;

type Candidate = { id: string; name: string; score: number; reason: string | null };
type Row = Candidate & { state: "queued" | "running" | "done" | "failed"; date: LiveDate };

export function MatchRunner({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "scoring" | "dating" | "finished" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [scored, setScored] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  const update = (id: string, fn: (r: Row) => Row) => setRows((rs) => rs.map((r) => (r.id === id ? fn(r) : r)));

  async function runOne(c: Candidate) {
    update(c.id, (r) => ({ ...r, state: "running" }));
    try {
      const res = await fetch("/api/dates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aId: personId, bId: c.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      let failed = false;
      await readDateStream(res, (e) => {
        if (e.type === "error") failed = true;
        update(c.id, (r) => ({ ...r, date: applyDateEvent(r.date, e) }));
      });
      update(c.id, (r) => ({ ...r, state: failed || r.date.phase !== "done" ? "failed" : "done" }));
    } catch (err) {
      update(c.id, (r) => ({
        ...r,
        state: "failed",
        date: { ...r.date, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function start() {
    setPhase("scoring");
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/match`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setScored(data.scored);
      const top: Candidate[] = data.top;
      setRows(top.map((c) => ({ ...c, state: "queued", date: initialLiveDate })));
      setPhase("dating");
      router.refresh(); // show the new prescores in "Top matches"

      const queue = [...top];
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          for (let c = queue.shift(); c; c = queue.shift()) await runOne(c);
        }),
      );
      setPhase("finished");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  if (phase === "idle" || phase === "error") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-2xl">Send {name.split(" ")[0]}&apos;s agent on dates</p>
          <p className="text-sm text-muted">
            Scores everyone, then goes on 5 dates with the best fits ({CONCURRENCY} at a time).
          </p>
          {error && <p className="mt-2 text-sm text-bad">{error}</p>}
        </div>
        <button
          onClick={start}
          className="shrink-0 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          Find matches →
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-display text-2xl">
          {phase === "scoring" ? "Scoring everyone…" : phase === "dating" ? "On dates" : "Dates finished"}
        </p>
        {phase !== "scoring" && <p className="text-sm text-muted">Top 5 of {scored} scored</p>}
      </div>
      {phase === "scoring" ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="size-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Comparing {name.split(" ")[0]}&apos;s profile with everyone else…
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const d = r.date;
            const turns = d.turns.filter((t) => !t.typing).length;
            const last = [...d.turns].reverse().find((t) => t.text);
            const match = d.verdicts.a?.secondDate && d.verdicts.b?.secondDate;
            const body = (
              <div className="flex items-center gap-3 py-3">
                <Avatar name={r.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-xs tabular-nums text-muted">fit {Math.round(r.score)}</span>
                  </p>
                  <p className="truncate text-sm text-muted">
                    {r.state === "queued"
                      ? r.reason
                      : r.state === "failed"
                        ? d.error ?? "Date failed"
                        : d.phase === "debriefing"
                          ? "Agents debriefing…"
                          : d.phase === "done"
                            ? d.setting
                            : last?.text ?? d.setting ?? "Choosing a setting…"}
                  </p>
                </div>
                <span className="shrink-0 text-xs">
                  {r.state === "queued" && <span className="text-muted">Queued</span>}
                  {r.state === "running" && d.phase !== "done" && (
                    <span className="rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn">
                      {d.phase === "debriefing" ? "Debrief" : `${turns}/${TOTAL_TURNS}`}
                    </span>
                  )}
                  {d.phase === "done" && (
                    <span className={`rounded-full px-2.5 py-1 font-medium ${match ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"}`}>
                      {d.verdicts.a?.score} · {d.verdicts.b?.score} {match ? "♥" : ""}
                    </span>
                  )}
                  {r.state === "failed" && <span className="rounded-full bg-bad-soft px-2.5 py-1 font-medium text-bad">Failed</span>}
                </span>
              </div>
            );
            return (
              <li key={r.id}>
                {d.dateId ? (
                  <Link href={`/dates/${d.dateId}`} target="_blank" className="block hover:opacity-80">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
