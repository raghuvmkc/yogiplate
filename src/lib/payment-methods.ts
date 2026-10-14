/** How an offline / manual payment was collected (admin calendar). */
export const MANUAL_PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "card_in_person", label: "Card (in person / terminal)" },
  { value: "bank_transfer", label: "Bank transfer / ACH" },
  { value: "other", label: "Other" },
] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]["value"];

const LABELS = Object.fromEntries(
  MANUAL_PAYMENT_METHODS.map((row) => [row.value, row.label])
) as Record<ManualPaymentMethod, string>;

export function isManualPaymentMethod(value: string): value is ManualPaymentMethod {
  return value in LABELS;
}

export function paymentMethodLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (isManualPaymentMethod(value)) return LABELS[value];
  if (value === "stripe_card") return "Card (Stripe online)";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
