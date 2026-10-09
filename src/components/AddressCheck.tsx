"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/pricing";

export type AddressCheckResult =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "ok";
      miles: number;
      fee: number;
      formatted: string | null;
      verified: boolean;
      taxRate: number;
    }
  | { status: "problem"; message: string }
  | { status: "error"; message: string };

type Stored = { key: string; result: AddressCheckResult };

/** Debounced address verification + delivery fee from /api/delivery/quote. */
export function useAddressCheck(input: {
  address: string;
  city: string;
  zip: string;
  state?: string;
  subtotal: number;
  enabled: boolean;
  requireZip?: boolean;
}): AddressCheckResult {
  const address = input.address.trim();
  const city = input.city.trim();
  const zip = input.zip.trim();
  const zipOk = /^\d{5}$/.test(zip) || (input.requireZip === false && !zip);
  const ready = input.enabled && address.length >= 5 && city.length >= 2 && zipOk;
  const key = ready
    ? JSON.stringify([address, city, zip, input.state || "CA", input.subtotal])
    : "";
  const [stored, setStored] = useState<Stored>({ key: "", result: { status: "idle" } });

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/delivery/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            city,
            zip,
            state: input.state || "CA",
            subtotal: input.subtotal,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStored({ key, result: { status: "error", message: data.error || "Could not check this address." } });
        } else if (data.problem) {
          setStored({ key, result: { status: "problem", message: data.problem } });
        } else {
          setStored({
            key,
            result: {
              status: "ok",
              miles: data.miles,
              fee: data.delivery_fee,
              formatted: data.formatted_address,
              verified: Boolean(data.address_verified),
              taxRate: Number(data.tax_rate) || 0,
            },
          });
        }
      } catch {
        if (!cancelled) {
          setStored({ key, result: { status: "error", message: "Could not check this address right now." } });
        }
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // key captures every input that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { status: "idle" };
  return stored.key === key ? stored.result : { status: "checking" };
}

export function AddressCheckNote({ check }: { check: AddressCheckResult }) {
  if (check.status === "idle" || check.status === "checking") {
    return check.status === "checking" ? (
      <p className="text-xs text-muted">Checking the address…</p>
    ) : null;
  }
  if (check.status === "ok") {
    return (
      <p className="border border-accent/40 bg-accent-soft/40 px-3 py-2 text-xs leading-relaxed text-foreground">
        <span className="font-semibold text-accent-deep">
          {check.verified ? "✓ Address found" : "Address noted"}
        </span>
        {check.formatted ? `: ${check.formatted}` : ""}
        <br />
        {check.miles} mi from our San Jose kitchen · Delivery {formatMoney(check.fee)}
        {check.verified ? null : (
          <>
            <br />
            We could not confirm the street right now, so the distance is estimated.
          </>
        )}
      </p>
    );
  }
  return (
    <p className="border border-red-300 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
      {check.message}
    </p>
  );
}
