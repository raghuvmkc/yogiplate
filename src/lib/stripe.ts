import Stripe from "stripe";
import { serverEnv } from "@/lib/server-env";

/**
 * Pull the secret key out of whatever was pasted into the hosting dashboard
 * (e.g. `STRIPE_SECRET_KEY = sk_live_...`, quotes, or several lines).
 */
function stripeSecretKey() {
  const value = serverEnv("STRIPE_SECRET_KEY");
  return value.match(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/)?.[0] || value;
}

/** Same Stripe account as the Stone Craft Pizza site. Keys are read at runtime. */
export function getStripe() {
  const key = stripeSecretKey();
  if (!key) return null;
  return new Stripe(key);
}

export function stripeConfigured() {
  return Boolean(stripeSecretKey());
}
