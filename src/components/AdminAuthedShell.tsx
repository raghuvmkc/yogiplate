"use client";

import type { ReactNode } from "react";
import { AdminCallBar } from "@/components/AdminCallBar";
import { AdminIdleLock } from "@/components/AdminIdleLock";
import { AdminVoiceProvider } from "@/components/AdminVoiceProvider";

/** Client shell for authenticated admin: voice lives here so route changes keep the call. */
export function AdminAuthedShell({ children }: { children: ReactNode }) {
  return (
    <AdminVoiceProvider>
      <AdminCallBar />
      {children}
      <AdminIdleLock />
    </AdminVoiceProvider>
  );
}
