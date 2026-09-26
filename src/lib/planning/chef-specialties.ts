/**
 * Chef signature items that exist in the seed catalog — never invent IDs.
 * Source: Mr. Radhavallabh / Stone Craft + house signatures.
 */

export type ChefSpecialty = {
  menu_item_id: string;
  label: string;
  why: string;
};

export const CHEF_SPECIALTIES: ChefSpecialty[] = [
  {
    menu_item_id: "item-palak-paneer",
    label: "Palak Paneer",
    why: "Chef’s house palak paneer — spinach purée with soft paneer.",
  },
  {
    menu_item_id: "item-alu-gobi",
    label: "Alu Gobi",
    why: "House signature alu gobi — dry-roasted in peanut oil and spice.",
  },
  {
    menu_item_id: "item-okra-stir-fry",
    label: "Okra stir fry",
    why: "Chef’s special okra — seared hot until tender-crisp.",
  },
  {
    menu_item_id: "item-smoky-paneer-makhni",
    label: "Smoky Paneer Makhni",
    why: "Signature smoky paneer makhni gravy.",
  },
  {
    menu_item_id: "pizza-margherita",
    label: "Margherita (Stone Craft)",
    why: "Stone Craft Pizza signature — classic margherita.",
  },
  {
    menu_item_id: "pizza-cheese",
    label: "Cheese Pizza (Stone Craft)",
    why: "Stone Craft Pizza — simple cheese crowd-pleaser.",
  },
  {
    menu_item_id: "pizza-smoked_veggie",
    label: "Smoked Veggie (Stone Craft)",
    why: "Stone Craft Pizza — smoked veggie specialty.",
  },
  {
    menu_item_id: "pizza-spinach_ricotta_stuffed",
    label: "Spinach Ricotta Stuffed (Stone Craft)",
    why: "Stone Craft Pizza — spinach ricotta stuffed specialty.",
  },
  {
    menu_item_id: "item-gulabjamun",
    label: "Gulabjamun",
    why: "Classic house sweet finish.",
  },
];

export function getChefSpecialties(itemIds?: string[]): ChefSpecialty[] {
  if (!itemIds?.length) return [...CHEF_SPECIALTIES];
  const want = new Set(itemIds);
  return CHEF_SPECIALTIES.filter((s) => want.has(s.menu_item_id));
}
