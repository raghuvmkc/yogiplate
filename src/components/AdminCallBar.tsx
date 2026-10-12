"use client";

import { usePathname } from "next/navigation";
import {
  callerLabel,
  useAdminVoice,
} from "@/components/AdminVoiceProvider";

/**
 * Sticky call controls while on a call or ringing — stays mounted across admin
 * pages so leaving Desk does not leave the manager without Answer / Hang up.
 */
export function AdminCallBar() {
  const pathname = usePathname();
  const {
    status,
    incoming,
    active,
    muted,
    phoneError,
    answer,
    decline,
    hangUp,
    toggleMute,
  } = useAdminVoice();

  const onDesk = pathname === "/admin/desk" || pathname?.startsWith("/admin/desk/");
  const remote = callerLabel(incoming) || callerLabel(active);
  const busy = Boolean(incoming || active);

  // Desk already has the full softphone; only show controls on other admin pages.
  if (onDesk || !busy) return null;

  return (
    <div
      className={`sticky top-0 z-40 border-b px-4 py-3 sm:px-6 ${
        incoming
          ? "border-[#8d3b32]/40 bg-[#f8ebe9]"
          : active
            ? "border-accent/40 bg-accent-soft"
            : "border-line bg-warm"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {incoming ? "Incoming call" : active ? "On a call" : "Phone"}
          </p>
          <p className="truncate text-sm text-muted">
            {remote || status}
            {remote && status !== remote ? ` · ${status}` : ""}
          </p>
          {phoneError ? (
            <p className="mt-1 text-xs font-medium text-[#8d3b32]">{phoneError}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {incoming ? (
            <>
              <button
                type="button"
                onClick={answer}
                className="bg-accent-deep px-4 py-2 text-sm font-semibold text-white"
              >
                Answer
              </button>
              <button
                type="button"
                onClick={decline}
                className="border border-line bg-white px-4 py-2 text-sm font-semibold"
              >
                Decline
              </button>
            </>
          ) : null}
          {active ? (
            <>
              <button
                type="button"
                onClick={toggleMute}
                className="border border-line bg-white px-4 py-2 text-sm font-semibold"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                onClick={hangUp}
                className="bg-[#8d3b32] px-4 py-2 text-sm font-semibold text-white"
              >
                Hang up
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
