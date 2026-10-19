import type { DateEvent, Verdict } from "@/lib/date-events";
import type { ChatTurn, DatePhase, Party } from "./DateChat";

export const TOTAL_TURNS = 8;

export type LiveDate = {
  dateId: string | null;
  a: Party | null;
  b: Party | null;
  setting: string | null;
  turns: ChatTurn[];
  verdicts: { a: Verdict | null; b: Verdict | null };
  phase: DatePhase;
  error: string | null;
};

export const initialLiveDate: LiveDate = {
  dateId: null,
  a: null,
  b: null,
  setting: null,
  turns: [],
  verdicts: { a: null, b: null },
  phase: "starting",
  error: null,
};

export function applyDateEvent(s: LiveDate, e: DateEvent): LiveDate {
  switch (e.type) {
    case "setting":
      return { ...s, dateId: e.dateId, a: e.a, b: e.b, setting: e.setting, phase: "talking" };
    case "turn_start": {
      const turns = [...s.turns];
      turns[e.turn] = { speaker: e.speaker, text: "", typing: true };
      return { ...s, turns };
    }
    case "token": {
      const turns = [...s.turns];
      const t = turns[e.turn];
      if (t) turns[e.turn] = { ...t, text: t.text + e.text };
      return { ...s, turns };
    }
    case "turn_end": {
      const turns = [...s.turns];
      turns[e.turn] = { speaker: e.speaker, text: e.text, typing: false };
      return { ...s, turns, phase: e.turn >= TOTAL_TURNS - 1 ? "debriefing" : s.phase };
    }
    case "debrief":
      return { ...s, verdicts: { ...s.verdicts, [e.side]: e.verdict } };
    case "done":
      return { ...s, phase: "done" };
    case "error":
      return { ...s, phase: "failed", error: e.message, dateId: s.dateId ?? e.dateId ?? null };
  }
}
