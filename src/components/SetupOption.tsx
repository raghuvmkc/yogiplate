"use client";

import { formatMoney } from "@/lib/pricing";

export function SetupOption(props: {
  fee: number;
  checked: boolean;
  onChange: (on: boolean) => void;
  compact?: boolean;
}) {
  const { fee, checked, onChange, compact } = props;
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 border px-3 py-3 transition ${
        checked ? "border-accent-deep bg-accent-deep/5" : "border-line"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-accent-deep"
      />
      <span className={compact ? "text-xs" : "text-sm"}>
        <span className="font-semibold text-foreground">
          Add full on-site setup (+{formatMoney(fee)})
        </span>
        <span className="mt-0.5 block text-muted">
          Our team sets up the buffet at your venue with elegant serving
          utensils and food warmers that keep every dish hot, ready to serve.
          Delivery orders only.
        </span>
      </span>
    </label>
  );
}
