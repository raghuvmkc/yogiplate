"use client";

import { useState } from "react";
import type { SiteSettings } from "@/lib/types";

export function AdminSettingsClient({ initial }: { initial: SiteSettings }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);

  async function save() {
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    setSettings(data.settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function num(key: keyof SiteSettings, value: string) {
    setSettings({ ...settings, [key]: Number(value) });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1
        className="text-4xl"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Delivery & business settings
      </h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Field
          label="Kitchen address"
          value={settings.kitchen_address}
          onChange={(v) => setSettings({ ...settings, kitchen_address: v })}
          wide
        />
        <Field
          label="Kitchen lat"
          value={String(settings.kitchen_lat)}
          onChange={(v) => num("kitchen_lat", v)}
        />
        <Field
          label="Kitchen lng"
          value={String(settings.kitchen_lng)}
          onChange={(v) => num("kitchen_lng", v)}
        />
        <Field
          label="Base delivery fee ($)"
          value={String(settings.base_delivery_fee)}
          onChange={(v) => num("base_delivery_fee", v)}
        />
        <Field
          label="Rate per mile ($)"
          value={String(settings.rate_per_mile)}
          onChange={(v) => num("rate_per_mile", v)}
        />
        <Field
          label="Free delivery threshold ($)"
          value={String(settings.free_delivery_threshold)}
          onChange={(v) => num("free_delivery_threshold", v)}
        />
        <Field
          label="Service radius (mi)"
          value={String(settings.service_radius_miles)}
          onChange={(v) => num("service_radius_miles", v)}
        />
        <Field
          label="Tax rate (e.g. 0.0975)"
          value={String(settings.tax_rate)}
          onChange={(v) => num("tax_rate", v)}
        />
        <Field
          label="Business email"
          value={settings.business_email}
          onChange={(v) => setSettings({ ...settings, business_email: v })}
        />
        <Field
          label="Business phone"
          value={settings.business_phone}
          onChange={(v) => setSettings({ ...settings, business_phone: v })}
        />
      </div>
      <button
        type="button"
        onClick={save}
        className="mt-8 bg-accent-deep px-6 py-3 text-sm font-semibold text-white"
      >
        Save settings
      </button>
      {saved ? <p className="mt-2 text-sm text-accent">Saved.</p> : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full border border-line px-3 py-2 outline-none focus:border-accent"
      />
    </label>
  );
}
