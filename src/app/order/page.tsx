import type { Metadata } from "next";
import { OrderBuilder } from "@/components/OrderBuilder";
import { DEFAULT_SETUP_FEE } from "@/lib/pricing";
import { pageMetadata } from "@/lib/seo";
import { getDb } from "@/lib/store/local-db";
import type { DietTag } from "@/lib/types";

export const metadata: Metadata = pageMetadata({
  title: "Build Your Catering Order",
  description:
    "Choose Jain, Swaminarayan, Pushtimarg, Pure Vegetarian, Vegan, or Italian — build trays online for Bay Area delivery or pickup. Pure vegetarian catering, no onion or garlic.",
  path: "/order",
});

const diets: DietTag[] = [
  "jain",
  "swaminarayan",
  "pushtimarg",
  "pure_vegetarian",
  "vegan",
  "italian",
];

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ diet?: string }>;
}) {
  const params = await searchParams;
  const initialDiet = diets.includes(params.diet as DietTag)
    ? (params.diet as DietTag)
    : undefined;

  const db = await getDb();

  return (
    <div className="bg-white">
      <OrderBuilder
        initialDiet={initialDiet}
        setupFee={db.settings.setup_fee ?? DEFAULT_SETUP_FEE}
      />
    </div>
  );
}
