import { NextResponse } from "next/server";
import { z } from "zod";
import type { DateEvent } from "@/lib/date-events";
import { runDate } from "@/lib/dating";
import { isReadOnly, readOnlyResponse } from "@/lib/readonly";

export const maxDuration = 300;

const body = z
  .object({ aId: z.uuid(), bId: z.uuid() })
  .refine((b) => b.aId !== b.bId, "aId and bId must differ");

// Runs a date and streams it as Server-Sent Events. The date keeps running (and is saved)
// even if the client disconnects.
export async function POST(req: Request) {
  if (isReadOnly()) return readOnlyResponse();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", issues: z.flattenError(parsed.error) }, { status: 400 });
  }
  const { aId, bId } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: DateEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          open = false; // client went away
        }
      };
      try {
        await runDate(aId, bId, send);
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
          dateId: (err as { dateId?: string }).dateId,
        });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
