"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TOTAL_TURNS } from "./dateState";
import { Avatar } from "./ui";
import { MATCH_CONCURRENCY as CONCURRENCY, useMatchRun } from "./useMatchRun";

export function MatchRunner({ personId, name }: { personId: string; name: string }) {
  const router = useRouter();
  // Refresh so "Top matches" and "Dates" pick up the new rows.
  const { phase, error, scored, rows, start } = useMatchRun(personId, {
    onScored: () => router.refresh(),
    onFinished: () => router.refresh(),
  });

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
