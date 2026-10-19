import OpenAI, { APIConnectionError, APIError } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ReasoningEffort } from "openai/resources/shared";
import type { z } from "zod";

// The only module that talks to the OpenAI SDK. Everything else uses these helpers.

export const MODEL_SMART = process.env.MODEL_SMART || "gpt-5";
export const MODEL_FAST = process.env.MODEL_FAST || "gpt-5-mini";

export type Message = { role: "user" | "assistant"; content: string };

let client: OpenAI | null = null;
function getClient() {
  // We do our own retries, so disable the SDK's.
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  return client;
}

// gpt-5 family accepts "minimal"; o-series reasoning models only take low/medium/high.
// Non-reasoning models (gpt-4o, gpt-4.1, ...) reject the parameter entirely.
function reasoningParams(model: string): { reasoning_effort?: ReasoningEffort } {
  const wanted: ReasoningEffort = model === MODEL_FAST ? "minimal" : "medium";
  if (/^gpt-5/.test(model) && !/-chat/.test(model)) return { reasoning_effort: wanted };
  if (/^o\d/.test(model)) return { reasoning_effort: wanted === "minimal" ? "low" : wanted };
  return {};
}

function isRetryable(err: unknown) {
  if (err instanceof APIConnectionError) return true;
  if (err instanceof APIError) {
    const status = err.status ?? 0;
    return status === 429 || status >= 500;
  }
  return false;
}

const MAX_RETRIES = 3;

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isRetryable(err)) throw err;
      const delay = 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

function toMessages(system: string, messages: Message[]) {
  return [{ role: "system" as const, content: system }, ...messages];
}

export async function structured<S extends z.ZodType>(
  schema: S,
  system: string,
  user: string,
  model: string = MODEL_SMART,
): Promise<z.infer<S>> {
  const completion = await withRetry(() =>
    getClient().chat.completions.parse({
      model,
      messages: toMessages(system, [{ role: "user", content: user }]),
      response_format: zodResponseFormat(schema, "output"),
      ...reasoningParams(model),
    }),
  );
  const message = completion.choices[0]?.message;
  if (message?.refusal) throw new Error(`Model refused: ${message.refusal}`);
  if (message?.parsed == null) throw new Error("Model returned no structured output");
  return message.parsed as z.infer<S>;
}

export async function chat(
  system: string,
  messages: Message[],
  model: string = MODEL_SMART,
): Promise<string> {
  const completion = await withRetry(() =>
    getClient().chat.completions.create({
      model,
      messages: toMessages(system, messages),
      ...reasoningParams(model),
    }),
  );
  return completion.choices[0]?.message?.content ?? "";
}

export async function* chatStream(
  system: string,
  messages: Message[],
  model: string = MODEL_SMART,
): AsyncIterable<string> {
  // Retries cover opening the stream; a failure mid-stream propagates to the caller.
  const stream = await withRetry(() =>
    getClient().chat.completions.create({
      model,
      messages: toMessages(system, messages),
      stream: true,
      ...reasoningParams(model),
    }),
  );
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
