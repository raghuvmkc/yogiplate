import { NextResponse } from "next/server";
import { z } from "zod";
import {
  sendCorporateInquiryEmail,
  smtpConfigured,
} from "@/lib/smtp";

const schema = z.object({
  company: z.string().trim().min(1, "Company is required").max(200),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(200),
  mobile: z.string().trim().min(7, "Mobile number is required").max(40),
  occasion: z.enum(
    [
      "Team lunches",
      "Office celebrations",
      "Employee events",
      "Client meetings",
      "Business gatherings",
    ],
    { message: "Occasion is required" }
  ),
  deliveryLocation: z
    .string()
    .trim()
    .min(3, "Delivery location is required")
    .max(400),
  eventDate: z.string().trim().min(1, "Delivery date is required"),
  guestCount: z.string().trim().max(40).optional(),
  dietPreference: z.string().trim().max(80).optional(),
  message: z.string().trim().max(2000).optional(),
  website: z.string().optional(), // honeypot
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid form" },
        { status: 400 }
      );
    }

    // Honeypot — bots fill hidden fields
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
    await sendCorporateInquiryEmail(payload);

    // Never return recipient addresses to the client
    return NextResponse.json({
      ok: true,
      message:
        "Thank you. Our team will get in touch with you shortly to confirm availability.",
    });
  } catch (err) {
    console.error("corporate inquiry email failed", err);
    return NextResponse.json(
      { error: "Could not send your request. Please try again shortly." },
      { status: 500 }
    );
  }
}
