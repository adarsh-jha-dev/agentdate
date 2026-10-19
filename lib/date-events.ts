// Shared between the server (SSE producer) and the browser (consumer). No server imports here.

export type Side = "a" | "b";

export type Verdict = {
  score: number;
  secondDate: boolean;
  clicked: string[];
  concerns: string[];
};

export type TranscriptTurn = { speaker: Side; text: string };

export type DateEvent =
  | { type: "setting"; dateId: string; setting: string; a: { id: string; name: string }; b: { id: string; name: string } }
  | { type: "turn_start"; turn: number; speaker: Side }
  | { type: "token"; turn: number; text: string }
  | { type: "turn_end"; turn: number; speaker: Side; text: string }
  | { type: "debrief"; side: Side; verdict: Verdict }
  | { type: "done"; dateId: string }
  | { type: "error"; message: string; dateId?: string };

// Reads a text/event-stream response body and calls onEvent for every `data:` frame.
export async function readDateStream(res: Response, onEvent: (e: DateEvent) => void) {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data) onEvent(JSON.parse(data) as DateEvent);
    }
  }
}
