import { connection } from "next/server";
import { CheckoutForm } from "@/components/CheckoutForm";
import { DEFAULT_SETUP_FEE } from "@/lib/pricing";
import { getDb } from "@/lib/store/local-db";

export default async function CheckoutPage() {
  await connection();
  const db = await getDb();
  return (
    <div className="bg-white">
      <CheckoutForm setupFee={db.settings.setup_fee ?? DEFAULT_SETUP_FEE} />
    </div>
  );
}
