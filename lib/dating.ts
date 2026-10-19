import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Analysis } from "./analyze";
import type { DateEvent, Side, TranscriptTurn, Verdict } from "./date-events";
import { db } from "./db";
import { profileDigest, profileForAgent } from "./digest";
import { chatStream, MODEL_FAST, MODEL_SMART, structured, type Message } from "./llm";
import { dates, people, profiles } from "./schema";

const TURNS = 8;

type Dater = { id: string; name: string; analysis: Analysis };

const settingSchema = z.object({
  setting: z.string().describe("One sentence: where they meet and what they do, e.g. built around a shared hobby"),
});

const verdictSchema = z.object({
  score: z.number().describe("0-100: how well this person fits your client"),
  secondDate: z.boolean(),
  clicked: z.array(z.string()).describe("What worked, each citing a transcript moment in quotes"),
  concerns: z.array(z.string()).describe("What worries you, each citing a transcript moment in quotes"),
});

function agentSystem(me: Dater, other: Dater, setting: string) {
  return `You are the dating agent for ${me.name}, representing them on a date. Speak as them in first person, using only facts from their profile. Goal: find out if this person truly fits ${me.name}'s needs and values. Be natural, ask real questions, share real details, probe dealbreakers politely. 1-3 sentences per turn.

Your date is with ${other.name}. Setting: ${setting}
This is a date, not a work meeting: get to know each other as people (what you care about, how you spend your time, what you want in a partner). Keep shop talk to a line or two.
Before the date ends, ask about at least one of ${me.name}'s needs and one of their possible dealbreakers (from the profile), in your own natural words. Be honest when an answer doesn't fit ${me.name}; don't paper over differences.
Only say what you are saying out loud: no stage directions, no name prefix, no quotation marks around your line. Hard limit: 3 sentences, about 50 words. Ask at most one question per turn.
Never invent specific people, places, events, anecdotes or numbers that are not in the profile. If something is not in your profile (see "unknowns"), do not make it up; say you'd rather hear about them, or turn it into a question.

${me.name}'s profile:
${profileForAgent(me.name, me.analysis)}`;
}

// The speaker's own past lines are "assistant"; the other person's are "user".
function messagesFor(side: Side, me: Dater, other: Dater, transcript: TranscriptTurn[]): Message[] {
  const opener: Message = {
    role: "user",
    content:
      side === "a"
        ? `[The date with ${other.name} is starting. You speak first: greet them and open the conversation.]`
        : `[The date with ${other.name} has started. Reply to them.]`,
  };
  return [
    opener,
    ...transcript.map((t): Message => ({ role: t.speaker === side ? "assistant" : "user", content: t.text })),
  ];
}

function debriefPrompt(me: Dater, other: Dater, side: Side, transcript: TranscriptTurn[]) {
  const lines = transcript.map((t) => `${t.speaker === side ? me.name : other.name}: ${t.text}`).join("\n");
  return `You were ${me.name}'s agent on a date with ${other.name}.

${me.name}'s profile:
${profileDigest(me.name, me.analysis)}

Transcript:
${lines}`;
}

const DEBRIEF_SYSTEM = `You privately debrief a date for your client. You are a demanding advocate: your job is to protect your client's time, not to be nice.
Judge only against your client's needs, values, lifestyle and possible dealbreakers, using what was actually said.
Every item in "clicked" and "concerns" must cite a specific moment by quoting words from the transcript.

Score guide (use the whole range):
- 85-100: rare. Clear evidence the other person fits several of your client's core needs AND values, they connected on something personal (not just work), and no dealbreaker came up.
- 70-84: real fit on more than one need or value, with only minor open questions.
- 50-69: pleasant, some overlap, but your client's key needs or values were untested or only partly matched.
- 30-49: little real overlap, mismatched pace/lifestyle/priorities, or the conversation stayed on work.
- 0-29: a possible dealbreaker was hit, or a clear incompatibility.
Shared work interests alone are not chemistry: cap the score at 65 if that is all they shared.

secondDate is true only if the score is 70 or higher AND nothing in "concerns" touches one of your client's possible dealbreakers. Most first dates should not earn a second date.`;

async function loadDaters(aId: string, bId: string): Promise<[Dater, Dater]> {
  const rows = await db
    .select({ id: people.id, name: people.name, status: people.status, analysis: profiles.analysis })
    .from(people)
    .leftJoin(profiles, eq(profiles.personId, people.id))
    .where(inArray(people.id, [aId, bId]));
  const get = (id: string): Dater => {
    const r = rows.find((x) => x.id === id);
    if (!r) throw new Error(`person ${id} not found`);
    if (!r.analysis) throw new Error(`${r.name} has no profile yet`);
    return { id: r.id, name: r.name, analysis: r.analysis as Analysis };
  };
  return [get(aId), get(bId)];
}

export async function runDate(aId: string, bId: string, onEvent: (e: DateEvent) => void) {
  if (aId === bId) throw new Error("a person cannot date themselves");
  const [a, b] = await loadDaters(aId, bId);

  const [row] = await db.insert(dates).values({ aId, bId, status: "running", transcript: [] }).returning({ id: dates.id });
  const dateId = row.id;

  try {
    const { setting } = await structured(
      settingSchema,
      "You plan first dates. Pick one specific, fitting date activity and place themed on something the two people actually share, such as a hobby, a food, a place or a pastime. Make it leisurely and personal: a walk, a market, a cooking class, a game, a gig, a hike, a museum, a food crawl. Never a work session, podcast recording, whiteboard, hackathon or meetup. One sentence. No protected attributes.",
      `${profileDigest(a.name, a.analysis)}\n\n---\n\n${profileDigest(b.name, b.analysis)}`,
      MODEL_FAST,
    );
    await db.update(dates).set({ setting }).where(eq(dates.id, dateId));
    onEvent({ type: "setting", dateId, setting, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } });

    const transcript: TranscriptTurn[] = [];
    for (let turn = 0; turn < TURNS; turn++) {
      const speaker: Side = turn % 2 === 0 ? "a" : "b";
      const [me, other] = speaker === "a" ? [a, b] : [b, a];
      onEvent({ type: "turn_start", turn, speaker });

      let text = "";
      for await (const delta of chatStream(agentSystem(me, other, setting), messagesFor(speaker, me, other, transcript), MODEL_FAST)) {
        text += delta;
        onEvent({ type: "token", turn, text: delta });
      }
      text = text.trim();
      if (!text) throw new Error(`${me.name}'s agent returned an empty turn`);

      transcript.push({ speaker, text });
      await db.update(dates).set({ transcript }).where(eq(dates.id, dateId));
      onEvent({ type: "turn_end", turn, speaker, text });
    }

    const debrief = async (side: Side): Promise<Verdict> => {
      const [me, other] = side === "a" ? [a, b] : [b, a];
      const v = await structured(verdictSchema, DEBRIEF_SYSTEM, debriefPrompt(me, other, side, transcript), MODEL_SMART);
      const verdict = { ...v, score: Math.round(Math.min(100, Math.max(0, v.score))) };
      onEvent({ type: "debrief", side, verdict });
      return verdict;
    };
    const [aVerdict, bVerdict] = await Promise.all([debrief("a"), debrief("b")]);

    await db
      .update(dates)
      .set({ aVerdict, bVerdict, aScore: aVerdict.score, bScore: bVerdict.score, status: "done" })
      .where(eq(dates.id, dateId));
    onEvent({ type: "done", dateId });
    return dateId;
  } catch (err) {
    await db.update(dates).set({ status: "failed" }).where(eq(dates.id, dateId));
    throw Object.assign(err instanceof Error ? err : new Error(String(err)), { dateId });
  }
}
