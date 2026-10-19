import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { MODEL_SMART, structured } from "./llm";
import { people, profiles, sources } from "./schema";
import type { InstagramProfile, LinkedInProfile } from "./scrape";

// OpenAI strict structured outputs: every field is required, so "maybe absent" is nullable, not optional.

const source = z.enum(["linkedin", "instagram"]);

const trait = z.object({
  trait: z.string(),
  evidence: z.string().describe("Verbatim quote copied from the provided data"),
  source,
});

const lifestyleItem = z
  .object({
    value: z.string(),
    evidence: z.string().describe("Verbatim quote copied from the provided data"),
  })
  .nullable();

export const analysisSchema = z.object({
  summary: z.string().describe("2-3 sentences"),
  needs: z.array(trait),
  hobbies: z.array(trait),
  interests: z.array(trait),
  values: z.array(trait),
  personality: z.object({
    traits: z.array(trait),
    communicationStyle: z.string(),
    energy: z.string(),
  }),
  lifestyle: z.object({
    pace: lifestyleItem,
    social: lifestyleItem,
    travel: lifestyleItem,
    fitness: lifestyleItem,
  }),
  careerStage: z.string(),
  ambitions: z.string(),
  dealbreakersGuess: z.array(
    z.object({
      trait: z.string(),
      evidence: z.string().describe("Verbatim quote copied from the provided data"),
    }),
  ),
  idealPartner: z.string(),
  dateStyle: z.string(),
  confidence: z.object({
    needs: z.number().describe("0 to 1"),
    hobbies: z.number().describe("0 to 1"),
    interests: z.number().describe("0 to 1"),
    values: z.number().describe("0 to 1"),
    personality: z.number().describe("0 to 1"),
  }),
  gaps: z.array(z.string()).describe("What the two sources do not reveal"),
});
export type Analysis = z.infer<typeof analysisSchema>;

const SYSTEM = `You build a dating profile for one person from their public LinkedIn and Instagram data.

Rules:
- Use ONLY the JSON you are given. No outside knowledge about the person, even if they are famous.
- Every trait, lifestyle item and dealbreaker needs "evidence": a short quote copied character-for-character from the data (a caption, bio, headline, job description, skill...). Do not paraphrase, translate or fix typos inside quotes. Keep quotes short (under ~120 characters).
- "source" is where the quote came from.
- If something is not supported by a quote, leave it out (or set the lifestyle field to null) and mention it in "gaps".
- Never infer or mention protected attributes: religion, ethnicity, race, caste, nationality-as-identity, sexual orientation, gender identity, health or disability, political affiliation. If the data states one, do not use it.
- Brand deals, sponsored posts and promotional captions say little about personal taste; weigh them lightly.
- summary is 2-3 sentences. careerStage, ambitions, idealPartner and dateStyle are short and must follow from the evidence.
- confidence values are 0 to 1 and reflect how much real evidence backs each section.`;

function promptFor(li: LinkedInProfile, ig: InstagramProfile) {
  return `LinkedIn (normalized):\n${JSON.stringify(li)}\n\nInstagram (normalized):\n${JSON.stringify(ig)}`;
}

// --- grounding: drop anything whose "verbatim" quote is not actually in the data ---

const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function isGrounded(evidence: string, haystack: string) {
  // Allow the model to elide with "..." between fragments; each fragment must appear.
  const fragments = evidence
    .split(/\.{3}|…/)
    .map((f) => norm(f).replace(/^["']|["']$/g, "").trim())
    .filter((f) => f.length > 0);
  return fragments.length > 0 && fragments.every((f) => haystack.includes(f));
}

function sourceText(value: unknown): string {
  // Collect every string value; JSON.stringify would escape newlines and quotes.
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return norm(out.join("\n"));
}

export function groundAnalysis(a: Analysis, li: LinkedInProfile, ig: InstagramProfile) {
  const text = { linkedin: sourceText(li), instagram: sourceText(ig) };
  const both = `${text.linkedin}\n${text.instagram}`;
  const dropped: string[] = [];

  const keep = <T extends { trait: string; evidence: string; source?: "linkedin" | "instagram" }>(
    section: string,
    items: T[],
  ) =>
    items.filter((t) => {
      const ok = isGrounded(t.evidence, t.source ? text[t.source] : both);
      if (!ok) dropped.push(`${section}: "${t.trait}"`);
      return ok;
    });

  const lifestyle = Object.fromEntries(
    Object.entries(a.lifestyle).map(([k, v]) => {
      if (v && !isGrounded(v.evidence, both)) {
        dropped.push(`lifestyle.${k}`);
        return [k, null];
      }
      return [k, v];
    }),
  ) as Analysis["lifestyle"];

  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const grounded: Analysis = {
    ...a,
    needs: keep("needs", a.needs),
    hobbies: keep("hobbies", a.hobbies),
    interests: keep("interests", a.interests),
    values: keep("values", a.values),
    personality: { ...a.personality, traits: keep("personality", a.personality.traits) },
    lifestyle,
    dealbreakersGuess: keep("dealbreakersGuess", a.dealbreakersGuess),
    confidence: {
      needs: clamp(a.confidence.needs),
      hobbies: clamp(a.confidence.hobbies),
      interests: clamp(a.confidence.interests),
      values: clamp(a.confidence.values),
      personality: clamp(a.confidence.personality),
    },
  };
  return { analysis: grounded, dropped };
}

export async function analyzePerson(li: LinkedInProfile, ig: InstagramProfile) {
  const raw = await structured(analysisSchema, SYSTEM, promptFor(li, ig), MODEL_SMART);
  return groundAnalysis(raw, li, ig);
}

// --- DB orchestration: analyzing -> ready | failed ---

export async function analyzeAndStore(personId: string) {
  await db.update(people).set({ status: "analyzing", error: null }).where(eq(people.id, personId));
  try {
    const rows = await db.select().from(sources).where(eq(sources.personId, personId));
    const li = rows.find((r) => r.kind === "linkedin")?.normalized as LinkedInProfile | undefined;
    const ig = rows.find((r) => r.kind === "instagram")?.normalized as InstagramProfile | undefined;
    if (!li || !ig) throw new Error("missing scraped LinkedIn or Instagram data");

    const { analysis, dropped } = await analyzePerson(li, ig);
    await db
      .insert(profiles)
      .values({ personId, analysis })
      .onConflictDoUpdate({ target: profiles.personId, set: { analysis, createdAt: new Date() } });
    const [person] = await db
      .update(people)
      .set({ status: "ready" })
      .where(eq(people.id, personId))
      .returning();
    return { person, analysis, dropped };
  } catch (err) {
    const message = `analysis: ${err instanceof Error ? err.message : String(err)}`;
    await db.update(people).set({ status: "failed", error: message }).where(eq(people.id, personId));
    throw new Error(message, { cause: err });
  }
}
