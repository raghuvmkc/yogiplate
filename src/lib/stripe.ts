import Stripe from "stripe";
import { serverEnv } from "@/lib/server-env";

/** Same Stripe account as the Stone Craft Pizza site. Keys are read at runtime. */
export function getStripe() {
  const key = serverEnv("STRIPE_SECRET_KEY");
  if (!key) return null;
  return new Stripe(key);
}

export function stripeConfigured() {
  return Boolean(serverEnv("STRIPE_SECRET_KEY"));
}
