/** Stripe errors carry a `type` like "StripeAuthenticationError". */
export function isStripeError(err: unknown): err is { type: string; message?: string } {
  return Boolean(
    err && typeof err === "object" && "type" in err && String((err as { type: unknown }).type).startsWith("Stripe")
  );
}

/** What a guest sees when Stripe fails. Never echoes Stripe's message, which can include key fragments. */
export function guestPaymentErrorMessage(err: unknown): string | null {
  if (!isStripeError(err)) return null;
  if (err.type === "StripeCardError" && err.message) return err.message;
  return "Online payment is temporarily unavailable. Please try again shortly, or call us and we will take the order.";
}
