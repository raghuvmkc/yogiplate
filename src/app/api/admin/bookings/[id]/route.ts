import { NextResponse } from "next/server";
import { canIssueRefunds, isAdminAuthenticated } from "@/lib/auth";
import { confirmBookingCardPayment } from "@/lib/admin-card-payment";
import {
  cancelBookingInvoice,
  emailBookingInvoice,
  getBookingDetail,
  recordBookingRefund,
  recordManualPayment,
  saveBookingDetail,
  type BookingDetailPatch,
} from "@/lib/booking-detail";
import {
  cancelUberForBooking,
  refreshUberForBooking,
  scheduleUberForBooking,
} from "@/lib/booking-uber";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const noStore = { headers: { "Cache-Control": "no-store" } };

function failure(err: unknown, status = 400) {
  const message = err instanceof Error ? err.message : "Request failed";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_req: Request, ctx: Ctx) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const detail = await getBookingDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail, noStore);
}

export async function PATCH(req: Request, ctx: Ctx) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as BookingDetailPatch;
  try {
    return NextResponse.json(await saveBookingDetail(id, body), noStore);
  } catch (err) {
    return failure(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    amount?: number;
    method?: string;
    note?: string;
    reason?: string;
    full?: boolean;
    paid_at?: string;
    payment_intent_id?: string;
    pickup_date?: string;
    pickup_time?: string;
    replace?: boolean;
  };
  try {
    if (body.action === "payment") {
      return NextResponse.json(
        await recordManualPayment(id, {
          amount: Number(body.amount),
          method: String(body.method || ""),
          note: body.note,
          paid_at: body.paid_at,
        }),
        noStore
      );
    }
    if (body.action === "card_payment") {
      if (!body.payment_intent_id) {
        return failure(new Error("Missing payment_intent_id."));
      }
      return NextResponse.json(
        await confirmBookingCardPayment(id, String(body.payment_intent_id)),
        noStore
      );
    }
    if (body.action === "email_invoice") {
      return NextResponse.json(await emailBookingInvoice(id), noStore);
    }
    if (body.action === "cancel_invoice") {
      return NextResponse.json(
        await cancelBookingInvoice(id, String(body.reason || "")),
        noStore
      );
    }
    if (body.action === "refund") {
      if (!(await canIssueRefunds())) {
        return NextResponse.json(
          { error: "Only the owner account can issue refunds." },
          { status: 403 }
        );
      }
      return NextResponse.json(
        await recordBookingRefund(id, {
          amount: Number(body.amount),
          note: body.note || body.reason,
          full: Boolean(body.full),
        }),
        noStore
      );
    }
    if (body.action === "uber_schedule") {
      const result = await scheduleUberForBooking(id, {
        pickup_date: String(body.pickup_date || ""),
        pickup_time: String(body.pickup_time || ""),
        replace: Boolean(body.replace),
      });
      return NextResponse.json(
        { ...result.detail, uber_sms: result.sms },
        noStore
      );
    }
    if (body.action === "uber_cancel") {
      const result = await cancelUberForBooking(id);
      return NextResponse.json(result.detail, noStore);
    }
    if (body.action === "uber_refresh") {
      const result = await refreshUberForBooking(id);
      return NextResponse.json(result.detail, noStore);
    }
    return failure(new Error("Unknown action"));
  } catch (err) {
    return failure(err);
  }
}
