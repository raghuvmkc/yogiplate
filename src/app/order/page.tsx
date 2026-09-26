import { OrderBuilder } from "@/components/OrderBuilder";
import type { DietTag } from "@/lib/types";

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

  return (
    <div className="bg-white">
      <OrderBuilder initialDiet={initialDiet} />
    </div>
  );
}
