import type { Metadata } from "next";
import { connection } from "next/server";
import { CheckoutForm } from "@/components/CheckoutForm";
import { DEFAULT_SETUP_FEE } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";
import { getDb } from "@/lib/store/local-db";

export const metadata: Metadata = pageMetadata({
  title: "Checkout",
  description: "Complete your Yogiplate catering order.",
  path: "/checkout",
  noIndex: true,
});

export default async function CheckoutPage() {
  await connection();
  const db = await getDb();
  return (
    <div className="bg-white">
      <CheckoutForm setupFee={db.settings.setup_fee ?? DEFAULT_SETUP_FEE} />
    </div>
  );
}
