import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import {
  deleteMenuItem,
  ensureSeededLocal,
  getCatalog,
  newId,
  upsertMenuItem,
} from "@/lib/repo";
import type { DietTag, MenuItem } from "@/lib/types";

export async function GET() {
  await ensureSeededLocal();
  const catalog = await getCatalog();
  return NextResponse.json(catalog);
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const item: MenuItem = {
    id: body.id || newId("item"),
    category_id: body.category_id,
    name: body.name,
    description: body.description || "",
    price: Number(body.price),
    unit: body.unit || "each",
    diet_tags: (body.diet_tags || []) as DietTag[],
    is_available: body.is_available !== false,
    notes: body.notes,
    min_quantity: body.min_quantity,
  };
  await upsertMenuItem(item);
  return NextResponse.json({ item });
}

export async function DELETE(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await deleteMenuItem(id);
  return NextResponse.json({ ok: true });
}
