"use client";

import { useEffect, useReducer, useRef } from "react";
import { readDateStream, type DateEvent } from "@/lib/date-events";
import { DateChat } from "./DateChat";
import { applyDateEvent, initialLiveDate, TOTAL_TURNS } from "./dateState";

// Starts a new date between a and b and renders it token by token as it streams in.
export function DateLive({ aId, bId }: { aId: string; bId: string }) {
  const [state, dispatch] = useReducer(applyDateEvent, initialLiveDate);
  const started = useRef(false);

  useEffect(() => {
    // Refs survive React StrictMode's dev double-mount, so this starts exactly one date.
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/dates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ aId, bId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        await readDateStream(res, (e: DateEvent) => {
          dispatch(e);
          // Give the page its permanent URL without re-rendering the route.
          if (e.type === "setting") window.history.replaceState(null, "", `/dates/${e.dateId}`);
        });
      } catch (err) {
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    })();
  }, [aId, bId]);

  return (
    <DateChat
      a={state.a}
      b={state.b}
      setting={state.setting}
      turns={state.turns}
      verdicts={state.verdicts}
      phase={state.phase}
      error={state.error}
      totalTurns={TOTAL_TURNS}
      toolbar={
        state.phase === "done" || state.phase === "failed" ? null : (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 animate-pulse rounded-full bg-accent" />
            Live
          </span>
        )
      }
    />
  );
}
