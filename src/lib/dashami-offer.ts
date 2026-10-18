/** 8:00 PM Pacific on Monday, October 19, 2026 (PDT, UTC−7). */
export const DASHAMI_DEADLINE_ISO = "2026-10-20T03:00:00.000Z";
export const DASHAMI_EVENT_DATE = "2026-10-20";
export const DASHAMI_EVENT_TIME = "12:00";
export const DASHAMI_PRICE = 79;
export const DASHAMI_MAX_MILES = 15;
export const DASHAMI_PATH = "/vijayadashami";

export const DASHAMI_MENU: { name: string; note: string }[] = [
  {
    name: "Chef’s special pineapple halwah",
    note: "Grass-fed pure butter and fresh pineapple. No essence.",
  },
  {
    name: "Puri or chapati",
    note: "Choose one. Puri is selected unless you switch to chapati.",
  },
  {
    name: "Palak paneer",
    note: "Chef’s special, made with fresh milk and fresh palak.",
  },
  {
    name: "Alu matar gobi sabji",
    note: "Potatoes, peas, and cauliflower.",
  },
  {
    name: "Special peas pulao",
    note: "Basmati rice with peas.",
  },
  {
    name: "Bindi cabbage sabji",
    note: "Okra and cabbage, cooked the same day.",
  },
  {
    name: "Kadi pakora",
    note: "Yogurt kadhi with pakora.",
  },
];

export function dashamiOrdersOpen(now = Date.now()) {
  return now < Date.parse(DASHAMI_DEADLINE_ISO);
}
