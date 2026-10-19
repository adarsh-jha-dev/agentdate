"use client";

import { useEffect, useState } from "react";
import type { SavedDate } from "@/lib/queries";
import { DateChat, type ChatTurn, type DatePhase } from "./DateChat";
import { TOTAL_TURNS } from "./dateState";

const CHARS_PER_TICK = 3;
const TICK_MS = 20;
const PAUSE_TICKS = 18; // ~350ms between turns

// Replays a saved date with a typing animation. If the date is still running,
// polls for new turns and types them out as they arrive.
export function DateReplay({ initial }: { initial: SavedDate }) {
  const [date, setDate] = useState(initial);
  const [reveal, setReveal] = useState({ turn: 0, chars: 0, pause: 0 });
  const [skipped, setSkipped] = useState(false);

  const transcript = date.transcript;
  const finishedTyping = skipped || reveal.turn >= transcript.length;

  useEffect(() => {
    if (date.status !== "running") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/dates/${date.id}`, { cache: "no-store" });
      if (res.ok) setDate(await res.json());
    }, 2500);
    return () => clearInterval(t);
  }, [date.id, date.status]);

  useEffect(() => {
    if (finishedTyping) return;
    const t = setInterval(() => {
      setReveal((r) => {
        if (r.pause > 0) return { ...r, pause: r.pause - 1 };
        const current = transcript[r.turn];
        if (!current) return r;
        const chars = r.chars + CHARS_PER_TICK;
        if (chars >= current.text.length) return { turn: r.turn + 1, chars: 0, pause: PAUSE_TICKS };
        return { ...r, chars };
      });
    }, TICK_MS);
    return () => clearInterval(t);
  }, [finishedTyping, transcript]);

  const shownTurns = skipped ? transcript.length : reveal.turn;
  const turns: ChatTurn[] = transcript.slice(0, shownTurns).map((t) => ({ ...t }));
  if (!finishedTyping && transcript[reveal.turn]) {
    const t = transcript[reveal.turn];
    turns.push({ speaker: t.speaker, text: t.text.slice(0, reveal.chars), typing: true });
  }

  const allTyped = finishedTyping && date.status !== "running";
  const phase: DatePhase =
    date.status === "failed"
      ? "failed"
      : date.status === "done" && finishedTyping
        ? "done"
        : transcript.length >= TOTAL_TURNS && finishedTyping
          ? "debriefing"
          : "talking";

  return (
    <DateChat
      a={date.a}
      b={date.b}
      setting={date.setting}
      turns={turns}
      verdicts={allTyped ? { a: date.aVerdict, b: date.bVerdict } : { a: null, b: null }}
      phase={phase}
      error={date.status === "failed" ? "This date did not finish." : null}
      totalTurns={TOTAL_TURNS}
      toolbar={
        !finishedTyping ? (
          <button onClick={() => setSkipped(true)} className="font-medium text-accent hover:underline">
            Skip to end →
          </button>
        ) : date.status === "running" ? (
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 animate-pulse rounded-full bg-accent" />In progress</span>
        ) : null
      }
    />
  );
}
