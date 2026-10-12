import { NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/monitor";
import { sendContactMessageEmail, smtpConfigured } from "@/lib/smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const recent = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(key, hits);
  return hits.length > MAX_PER_WINDOW;
}

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("Please enter a valid email address.").max(200),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a phone number.")
    .max(40)
    .refine((value) => value.replace(/\D/g, "").length >= 10, {
      message: "Please enter a phone number with at least 10 digits.",
    }),
  message: z
    .string()
    .trim()
    .min(5, "Please enter a short message.")
    .max(2000),
  website: z.string().optional(),
});

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for") ||
    "local";
  if (rateLimited(ip.split(",")[0]!.trim())) {
    return NextResponse.json(
      { error: "Too many messages. Please wait a few minutes." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid form" },
        { status: 400 }
      );
    }

    if (parsed.data.website) {
      return NextResponse.json({ ok: true });
    }

    if (!smtpConfigured()) {
      return NextResponse.json(
        {
          error:
            "Email is not configured yet. Please call us or try again later.",
        },
        { status: 503 }
      );
    }

    const { website: _honeypot, ...payload } = parsed.data;
    await sendContactMessageEmail(payload);

    return NextResponse.json({
      ok: true,
      message:
        "Your message is sent. Our store manager will respond to your message.",
    });
  } catch (err) {
    await reportError("contact-message", err);
    return NextResponse.json(
      { error: "Could not send your message. Please try again shortly." },
      { status: 500 }
    );
  }
}
