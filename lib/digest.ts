import type { Analysis } from "./analyze";

type T = { trait: string; evidence: string };
const traits = (xs: T[]) => xs.map((t) => t.trait).join(", ") || "unknown";

// Compact, evidence-free view of a profile for cheap comparisons (prescoring).
export function profileDigest(name: string, a: Analysis) {
  const lifestyle = Object.entries(a.lifestyle)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v!.value}`)
    .join("; ");
  return [
    `Name: ${name}`,
    `Summary: ${a.summary}`,
    `Needs: ${traits(a.needs)}`,
    `Values: ${traits(a.values)}`,
    `Interests: ${traits(a.interests)}`,
    `Hobbies: ${traits(a.hobbies)}`,
    `Personality: ${traits(a.personality.traits)}; communication: ${a.personality.communicationStyle}; energy: ${a.personality.energy}`,
    `Lifestyle: ${lifestyle || "unknown"}`,
    `Career: ${a.careerStage}. Ambitions: ${a.ambitions}`,
    `Possible dealbreakers: ${traits(a.dealbreakersGuess)}`,
    `Ideal partner: ${a.idealPartner}`,
    `Date style: ${a.dateStyle}`,
  ].join("\n");
}

// Full profile including evidence quotes, for an agent that must speak only from facts.
export function profileForAgent(name: string, a: Analysis) {
  return JSON.stringify({
    name,
    summary: a.summary,
    needs: a.needs,
    values: a.values,
    interests: a.interests,
    hobbies: a.hobbies,
    personality: a.personality,
    lifestyle: a.lifestyle,
    careerStage: a.careerStage,
    ambitions: a.ambitions,
    dealbreakersGuess: a.dealbreakersGuess,
    idealPartner: a.idealPartner,
    dateStyle: a.dateStyle,
    unknowns: a.gaps,
  });
}
