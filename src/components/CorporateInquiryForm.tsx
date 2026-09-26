"use client";

import { FormEvent, useMemo, useState } from "react";
import { PRIMARY_DIETS, DIET_LABELS } from "@/lib/data/menu-seed";

type Status = "idle" | "sending" | "success" | "error";

const OCCASIONS = [
  "Team lunches",
  "Office celebrations",
  "Employee events",
  "Client meetings",
  "Business gatherings",
] as const;

export function CorporateInquiryForm() {
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }, []);

  const [company, setCompany] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [occasion, setOccasion] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [dietPreference, setDietPreference] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [feedback, setFeedback] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setFeedback("");
    try {
      const res = await fetch("/api/corporate-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company,
          name,
          email,
          mobile,
          occasion,
          deliveryLocation,
          eventDate,
          guestCount,
          dietPreference,
          message,
          website,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setFeedback(data.error || "Something went wrong.");
        return;
      }
      setStatus("success");
      setFeedback(
        data.message ||
          "Thank you. Our team will get in touch with you shortly."
      );
      setCompany("");
      setName("");
      setEmail("");
      setMobile("");
      setOccasion("");
      setDeliveryLocation("");
      setEventDate("");
      setGuestCount("");
      setDietPreference("");
      setMessage("");
    } catch {
      setStatus("error");
      setFeedback("Could not send your request. Please try again.");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-2 border-line bg-white p-6 sm:p-8"
      noValidate
    >
      <p className="eyebrow">Request a consultation</p>
      <h2 className="font-display mt-3 text-3xl text-foreground sm:text-4xl">
        Tell us about your gathering
      </h2>
      <p className="mt-3 text-base font-medium text-muted">
        Fill out the form. We will call you to confirm availability and craft
        the right menu for your team.
      </p>

      {/* Honeypot */}
      <label className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        Website
        <input
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </label>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-foreground">Company name</span>
          <input
            required
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
            placeholder="Your company"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Mobile No.</span>
          <input
            required
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Guest count</span>
          <input
            type="number"
            min={10}
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
            placeholder="Approx. headcount"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-foreground">Occasion</span>
          <select
            required
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
          >
            <option value="">Select an occasion</option>
            {OCCASIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-foreground">
            Delivery Location
          </span>
          <input
            required
            value={deliveryLocation}
            onChange={(e) => setDeliveryLocation(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
            placeholder="Office address or campus"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">Delivery Date</span>
          <input
            required
            type="date"
            min={tomorrow}
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-foreground">
            Dietary preference
          </span>
          <select
            value={dietPreference}
            onChange={(e) => setDietPreference(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
          >
            <option value="">Select (optional)</option>
            {PRIMARY_DIETS.map((d) => (
              <option key={d} value={DIET_LABELS[d]}>
                {DIET_LABELS[d]}
              </option>
            ))}
            <option value="Mixed / multiple">Mixed / multiple</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="font-semibold text-foreground">
            Notes for our kitchen
          </span>
          <textarea
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1.5 w-full border border-line bg-white px-3 py-2.5 outline-none focus:border-accent"
            placeholder="Allergies, budget range, recurring lunch program, seating notes…"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-8 w-full bg-accent-deep px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-accent disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Please wait…" : "Submit"}
      </button>

      {feedback ? (
        <p
          className={`mt-4 text-sm font-medium ${
            status === "error" ? "text-red-700" : "text-accent"
          }`}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
