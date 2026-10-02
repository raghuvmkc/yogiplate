import { NextResponse } from "next/server";
import { getQuoteByToken, prepareQuotePresentation } from "@/lib/quotes";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") || "";
  const found = await getQuoteByToken(id, token);
  if (!found) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote = await prepareQuotePresentation(found);
  return NextResponse.json({ quote });
}
