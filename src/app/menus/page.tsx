import { redirect } from "next/navigation";

/** Legacy browse page — dishes live in Build order. */
export default async function MenusRedirect({
  searchParams,
}: {
  searchParams: Promise<{ diet?: string }>;
}) {
  const params = await searchParams;
  if (params.diet) {
    redirect(`/order?diet=${encodeURIComponent(params.diet)}`);
  }
  redirect("/order");
}
