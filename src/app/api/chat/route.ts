import { NextResponse } from "next/server";
import { z } from "zod";
import { agentErrorCode, runFrontDeskTurn } from "@/lib/chat/agent";
import { reportError } from "@/lib/monitor";
import { serverEnv } from "@/lib/server-env";
import { isSarvamConfigured } from "@/lib/sarvam";
import { openSarvamTtsStream } from "@/lib/sarvam-stream";
import { ttsProvider } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 26;

/** Longest wait for streamed speech after the reply is done. */
const TTS_DRAIN_MS = 10_000;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
  lead: z.object({
    name: z.string().min(2),
    phone: z.string().min(7),
    email: z.string().email(),
    event_date: z.string().optional(),
    guest_count: z.number().nullable().optional(),
    diet: z.string().optional(),
    city: z.string().optional(),
    notes: z.string().optional(),
  }),
  order_context: z
    .object({
      page: z.string().optional(),
      diet: z.string().nullable().optional(),
      guest_count: z.number().nullable().optional(),
      event_date: z.string().optional(),
      notes: z.string().optional(),
      item_count: z.number().optional(),
      subtotal: z.number().optional(),
      items: z
        .array(
          z.object({
            name: z.string(),
            quantity: z.number(),
            unit: z.string().optional(),
            price: z.number().optional(),
            menu_item_id: z.string().optional(),
            variant_id: z.string().optional(),
          })
        )
        .max(80)
        .optional(),
    })
    .optional(),
  order_draft: z
    .object({
      occasion: z.string().optional(),
      event_date: z.string().optional(),
      event_time: z.string().optional(),
      adults: z.number().nullable().optional(),
      kids: z.number().nullable().optional(),
      diet: z.string().optional(),
      delivery_or_pickup: z.string().optional(),
      city: z.string().optional(),
      address: z.string().optional(),
      budget: z.string().optional(),
      setup_needs: z.string().optional(),
      special_requirements: z.string().optional(),
      company_name: z.string().optional(),
      meal: z.string().optional(),
      package_tier: z.string().optional(),
      confirmed: z.boolean().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  session_id: z.string().min(4).max(80).optional(),
  voice_mode: z.boolean().optional(),
  stream: z.boolean().optional(),
  /** Browser can play streamed MP3; speak the reply over Sarvam's WebSocket inside this stream. */
  tts_stream: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!serverEnv("GEMINI_API_KEY")) {
    return NextResponse.json(
      { error: "Chat is not configured (missing GEMINI_API_KEY).", code: "no_key" },
      { status: 503 }
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      {
        error:
          "Name, phone, and email are required before chat can start. Please share all three to continue.",
        code: "bad_request",
      },
      { status: 400 }
    );
  }

  if (body.lead.name.trim().length < 2) {
    return NextResponse.json(
      { error: "Please enter your name to start chat.", code: "bad_name" },
      { status: 400 }
    );
  }

  const phoneDigits = body.lead.phone.replace(/\D/g, "");
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return NextResponse.json(
      { error: "Please enter a valid phone number to start chat.", code: "bad_phone" },
      { status: 400 }
    );
  }

  const last = body.messages[body.messages.length - 1];
  if (last.role !== "user") {
    return NextResponse.json(
      { error: "Last message must be from the user.", code: "bad_role" },
      { status: 400 }
    );
  }

  const turn = {
    messages: body.messages,
    lead: body.lead,
    order_context: body.order_context,
    order_draft: body.order_draft as
      | Partial<import("@/lib/chat/order-draft").OrderDraft>
      | undefined,
    session_id: body.session_id,
    channel: "web_chat" as const,
    voice_mode: Boolean(body.voice_mode),
  };

  if (body.stream) {
    const speak =
      turn.voice_mode && Boolean(body.tts_stream) && ttsProvider() === "sarvam" && isSarvamConfigured();
    return streamTurn(turn, speak);
  }

  try {
    const result = await runFrontDeskTurn(turn);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(await chatFailure(err), { status: 502 });
  }
}

async function chatFailure(err: unknown) {
  const detail = err instanceof Error ? err.message : String(err);
  await reportError("chat", detail, { code: agentErrorCode(detail) });
  const safeDetail = detail.replace(/key=[^&\s]+/gi, "key=***").slice(0, 240);
  return {
    error:
      "Sorry — the front desk chat is briefly unavailable. Please try again, or use Build order.",
    code: agentErrorCode(detail),
    detail: safeDetail,
  };
}

/**
 * NDJSON: {t:"delta",round,text} / {t:"status",text} … then {t:"done",result} or {t:"error",…}.
 * With `speak`, also {t:"audio",b64} MP3 chunks, then {t:"audio_end",ok,chunks} after done.
 */
function streamTurn(turn: Parameters<typeof runFrontDeskTurn>[0], speak: boolean) {
  const encoder = new TextEncoder();
  const startedAt = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (event: Record<string, unknown>) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const tts = speak
        ? openSarvamTtsStream({ onAudio: (b64) => write({ t: "audio", b64 }) })
        : null;
      try {
        const result = await runFrontDeskTurn({
          ...turn,
          onReplyDelta: ({ round, text }) => {
            write({ t: "delta", round, text });
            tts?.feed(round, text);
          },
          onStatus: (text) => write({ t: "status", text }),
        });
        tts?.finish(String(result.reply || ""));
        write({ t: "done", result });
        if (tts) {
          const left = (maxDuration - 1) * 1000 - (Date.now() - startedAt);
          const audio = await tts.drained(Math.min(TTS_DRAIN_MS, left));
          write({ t: "audio_end", ok: audio.ok, chunks: audio.chunks });
        }
      } catch (err) {
        write({ t: "error", ...(await chatFailure(err)) });
      } finally {
        tts?.close();
        open = false;
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
