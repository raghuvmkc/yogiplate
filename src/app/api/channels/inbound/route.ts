import { NextResponse } from "next/server";
import { z } from "zod";
import { handleChannelInbound } from "@/lib/channels/inbound";

export const runtime = "nodejs";
export const maxDuration = 26;

const BodySchema = z.object({
  channel: z.enum([
    "web_chat",
    "whatsapp",
    "sms",
    "email",
    "phone",
    "ezcater",
    "other",
  ]),
  external_id: z.string().min(1).max(120),
  text: z.string().min(1).max(4000),
  lead: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional()
    .default({}),
  /** Shared secret for non-browser channel adapters. */
  secret: z.string().optional(),
});

function authorized(secret?: string) {
  const expected = process.env.CHANNEL_INBOUND_SECRET || "";
  if (!expected) {
    // Allow in non-production for local testing; require secret when set.
    return process.env.NODE_ENV !== "production";
  }
  return Boolean(secret && secret === expected);
}

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (!authorized(body.secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await handleChannelInbound({
    channel: body.channel,
    external_id: body.external_id,
    text: body.text,
    lead: body.lead,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
