"use client";

import { useState } from "react";
import { readDateStream } from "@/lib/date-events";
import { applyDateEvent, initialLiveDate, type LiveDate } from "./dateState";

export const MATCH_CONCURRENCY = 3;

export type MatchCandidate = { id: string; name: string; score: number; reason: string | null };
export type MatchRow = MatchCandidate & { state: "queued" | "running" | "done" | "failed"; date: LiveDate };
export type MatchPhase = "idle" | "scoring" | "dating" | "finished" | "error";

// Prescore a person, then run dates with their top 5 (MATCH_CONCURRENCY at a time), tracking each live.
export function useMatchRun(
  personId: string,
  callbacks: { onScored?: () => void; onFinished?: () => void } = {},
) {
  const [phase, setPhase] = useState<MatchPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [scored, setScored] = useState(0);
  const [rows, setRows] = useState<MatchRow[]>([]);

  const update = (id: string, fn: (r: MatchRow) => MatchRow) =>
    setRows((rs) => rs.map((r) => (r.id === id ? fn(r) : r)));

  async function runOne(c: MatchCandidate) {
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
      const top: MatchCandidate[] = data.top;
      setRows(top.map((c) => ({ ...c, state: "queued", date: initialLiveDate })));
      setPhase("dating");
      callbacks.onScored?.();

      const queue = [...top];
      await Promise.all(
        Array.from({ length: MATCH_CONCURRENCY }, async () => {
          for (let c = queue.shift(); c; c = queue.shift()) await runOne(c);
        }),
      );
      setPhase("finished");
      callbacks.onFinished?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  return { phase, error, scored, rows, start };
}
