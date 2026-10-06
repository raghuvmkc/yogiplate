import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  emailBookingInvoice,
  getBookingDetail,
  recordManualPayment,
  saveBookingDetail,
  type BookingDetailPatch,
} from "@/lib/booking-detail";

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
    note?: string;
    paid_at?: string;
  };
  try {
    if (body.action === "payment") {
      return NextResponse.json(
        await recordManualPayment(id, {
          amount: Number(body.amount),
          note: body.note,
          paid_at: body.paid_at,
        }),
        noStore
      );
    }
    if (body.action === "email_invoice") {
      return NextResponse.json(await emailBookingInvoice(id), noStore);
    }
    return failure(new Error("Unknown action"));
  } catch (err) {
    return failure(err);
  }
}
