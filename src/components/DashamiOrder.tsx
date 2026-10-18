"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useAddressCheck } from "@/components/AddressCheck";
import { DASHAMI_MAX_MILES, DASHAMI_MENU, DASHAMI_PRICE } from "@/lib/dashami-offer";
import { formatMoney } from "@/lib/pricing";

const field =
  "mt-1 w-full border border-[#e4d3b4] bg-white px-3 py-3 text-base text-[#2a241c] outline-none focus:border-[#8d3b24]";

export function DashamiOrder({ open }: { open: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [bread, setBread] = useState<"puri" | "chapati">("puri");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const check = useAddressCheck({
    address,
    city,
    zip,
    state: "CA",
    subtotal: DASHAMI_PRICE,
    enabled: open,
  });

  const tooFar = check.status === "ok" && check.miles > DASHAMI_MAX_MILES;
  const unconfirmed = check.status === "ok" && !check.verified;
  const ready = open && check.status === "ok" && !tooFar && !unconfirmed && !busy;

  async function pay(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/dashami", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          address,
          city,
          zip,
          bread,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error || "Payment could not start. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Payment could not start. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="bg-[#fff8ef] text-[#2a241c]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#3d6b4f]">
            Vijaya Dashami special
          </p>
          <h1
            className="mt-3 text-5xl text-[#8d3b24] sm:text-6xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Family lunch
          </h1>
          <p className="mt-3 text-lg text-[#5c4a38]">
            Freshly cooked by Chef Radhavallabh for Tuesday, October 20.
          </p>

          <div className="relative mt-6 overflow-hidden border border-[#e4d3b4] bg-white shadow-[0_18px_50px_rgba(141,59,36,0.08)]">
            <Image
              src="/images/vijayadashami-lunch.jpg"
              alt="Vijaya Dashami family lunch on a banana leaf, $79 for two adults and two kids"
              width={1200}
              height={1500}
              priority
              className="h-auto w-full"
            />
          </div>

          <div className="mt-8 border border-[#e4d3b4] bg-white px-5 py-5">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#8d3b24]">
              Cooked the day it arrives
            </p>
            <p className="mt-3 leading-relaxed text-[#3f3428]">
              Chef Radhavallabh prepares this lunch with ingredients cut the same morning,
              including paneer made from fresh milk. The palak is fresh, and the pineapple
              halwah is finished with grass-fed butter — no essence.
            </p>
            <p className="mt-3 leading-relaxed text-[#3f3428]">
              Some kitchens cook ahead, hold the food, then mix and heat it before delivery.
              This plate is cooked for your family on the day of the festival. The difference
              is in the taste.
            </p>
          </div>
        </div>

        <form onSubmit={pay} className="lg:sticky lg:top-6 lg:self-start">
          <div className="border border-[#e4d3b4] bg-white px-5 py-6 shadow-[0_18px_50px_rgba(141,59,36,0.08)] sm:px-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#3d6b4f]">
                  Your lunch
                </p>
                <p className="mt-1 text-sm text-[#5c4a38]">2 adults + 2 kids · one family</p>
              </div>
              <p
                className="text-5xl text-[#8d3b24]"
                style={{ fontFamily: "var(--font-display), Georgia, serif" }}
              >
                {formatMoney(DASHAMI_PRICE)}
              </p>
            </div>
            <p className="mt-2 text-sm text-[#5c4a38]">
              Free home delivery within {DASHAMI_MAX_MILES} miles. 100% pure vegetarian · no onion · no garlic.
            </p>

            <ol className="mt-5 space-y-3 border-t border-[#f0e2cc] pt-5">
              {DASHAMI_MENU.map((item, index) => (
                <li key={item.name} className="flex gap-3 text-sm">
                  <span className="mt-0.5 w-5 shrink-0 font-semibold text-[#8d3b24]">{index + 1}</span>
                  <span>
                    <span className="font-semibold">{item.name}</span>
                    <span className="block text-[#5c4a38]">{item.note}</span>
                  </span>
                </li>
              ))}
            </ol>

            <fieldset className="mt-5 border-t border-[#f0e2cc] pt-5" disabled={!open || busy}>
              <legend className="text-sm font-semibold">Bread</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(
                  [
                    ["puri", "Puri"],
                    ["chapati", "Chapati"],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    onClick={() => setBread(value)}
                    className={`flex cursor-pointer items-center justify-center border px-3 py-3 text-sm font-semibold ${
                      bread === value
                        ? "border-[#8d3b24] bg-[#fff4e8] text-[#8d3b24]"
                        : "border-[#e4d3b4] text-[#3f3428]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="bread"
                      className="sr-only"
                      checked={bread === value}
                      onChange={() => setBread(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {open ? (
              <div className="mt-5 space-y-3 border-t border-[#f0e2cc] pt-5">
                <label className="block text-sm font-semibold">
                  Name
                  <input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={field} />
                </label>
                <label className="block text-sm font-semibold">
                  Phone
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Email for your receipt
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Street address
                  <input
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    autoComplete="street-address"
                    className={field}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-semibold">
                    City
                    <input
                      required
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      autoComplete="address-level2"
                      className={field}
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    ZIP
                    <input
                      required
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      autoComplete="postal-code"
                      inputMode="numeric"
                      className={field}
                    />
                  </label>
                </div>

                {check.status === "checking" ? (
                  <p className="text-sm text-[#5c4a38]">Checking the address…</p>
                ) : null}
                {check.status === "ok" && !tooFar && !unconfirmed ? (
                  <p className="border border-[#c9dfcf] bg-[#f3faf5] px-3 py-2 text-sm text-[#245338]">
                    Address confirmed · {check.miles} miles from the kitchen · free delivery
                  </p>
                ) : null}
                {tooFar ? (
                  <p className="border border-[#e7c2b4] bg-[#fff4ef] px-3 py-2 text-sm text-[#8d3b24]">
                    This address is {check.miles} miles away. For this lunch we are not accepting orders beyond {DASHAMI_MAX_MILES} miles.
                  </p>
                ) : null}
                {unconfirmed ? (
                  <p className="border border-[#e7c2b4] bg-[#fff4ef] px-3 py-2 text-sm text-[#8d3b24]">
                    We could not confirm that street. Please check the address and try again.
                  </p>
                ) : null}
                {check.status === "problem" || check.status === "error" ? (
                  <p className="border border-[#e7c2b4] bg-[#fff4ef] px-3 py-2 text-sm text-[#8d3b24]">
                    {check.message}
                  </p>
                ) : null}
                {error ? <p className="text-sm font-semibold text-[#8d3b24]">{error}</p> : null}

                <button
                  type="submit"
                  disabled={!ready}
                  className="w-full bg-[#8d3b24] px-4 py-3.5 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Opening secure payment…" : `Pay ${formatMoney(DASHAMI_PRICE)}`}
                </button>
                <p className="text-center text-xs leading-relaxed text-[#5c4a38]">
                  The menu is set for this lunch. Pre-orders close Monday, October 19 at 8:00 PM Pacific.
                  Questions: (408) 335-4055.
                </p>
              </div>
            ) : (
              <p className="mt-5 border border-[#e4d3b4] bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed">
                Pre-orders for this Vijaya Dashami lunch are closed. They ended Monday, October 19 at 8:00 PM Pacific.
                Call (408) 335-4055 if you still need help.
              </p>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
