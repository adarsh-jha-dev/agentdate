import { NextResponse } from "next/server";

// READ_ONLY=true turns off everything that spends Apify/OpenAI credits (adding people, analysis,
// matching, dates). Browsing profiles, transcripts, rankings and /demo keeps working.
export const isReadOnly = () => process.env.READ_ONLY === "true";

export function readOnlyResponse() {
  return NextResponse.json(
    { error: "This deployment is read-only: adding people and running dates are turned off." },
    { status: 403 },
  );
}
