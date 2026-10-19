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
Only say what you are saying out loud: no stage directions, no name prefix, no quotation marks around your line.
If something is not in your profile (see "unknowns"), do not invent it; deflect or turn it into a question.

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

const DEBRIEF_SYSTEM = `You privately debrief a date for your client. Judge only against your client's needs, values and possible dealbreakers, using what was actually said.
Every item in "clicked" and "concerns" must cite a specific moment by quoting words from the transcript.
Be honest: a pleasant chat with no real overlap is not a match. Score 0-100.`;

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
      "You plan first dates. Pick one specific, fitting setting based on what the two people actually have in common (a shared hobby or interest if there is one). One sentence. No protected attributes.",
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
