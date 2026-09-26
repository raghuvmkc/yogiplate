import { NextResponse } from "next/server";
import { z } from "zod";
import { agentErrorCode, runFrontDeskTurn } from "@/lib/chat/agent";

export const runtime = "nodejs";
export const maxDuration = 26;

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
      guest_count: z.number().optional(),
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
      meal: z.string().optional(),
      package_tier: z.string().optional(),
      confirmed: z.boolean().optional(),
      notes: z.string().optional(),
    })
    .optional(),
  session_id: z.string().min(4).max(80).optional(),
});

export async function POST(req: Request) {
  if (!(process.env.GEMINI_API_KEY || "").trim()) {
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

  try {
    const result = await runFrontDeskTurn({
      messages: body.messages,
      lead: body.lead,
      order_context: body.order_context,
      order_draft: body.order_draft as
        | Partial<import("@/lib/chat/order-draft").OrderDraft>
        | undefined,
      session_id: body.session_id,
      channel: "web_chat",
    });
    return NextResponse.json(result);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[chat]", detail);
    const safeDetail = detail.replace(/key=[^&\s]+/gi, "key=***").slice(0, 240);
    return NextResponse.json(
      {
        error:
          "Sorry — the front desk chat is briefly unavailable. Please try again, or use Build order.",
        code: agentErrorCode(detail),
        detail: safeDetail,
      },
      { status: 502 }
    );
  }
}
