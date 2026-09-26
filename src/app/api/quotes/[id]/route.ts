import { NextResponse } from "next/server";
import { getQuoteByToken } from "@/lib/quotes";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") || "";
  const quote = await getQuoteByToken(id, token);
  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  return NextResponse.json({ quote });
}
