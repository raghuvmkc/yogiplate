"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type DeskCall = {
  accept: () => void;
  reject: () => void;
  disconnect: () => void;
  mute: (muted?: boolean) => void;
  sendDigits: (digits: string) => void;
  on: (event: string, handler: () => void) => void;
  parameters: { From?: string; To?: string };
  customParameters?: Map<string, string>;
};

export type CallRow = {
  sid: string;
  from: string;
  to: string;
  status: string;
  direction: string;
  duration: string;
  started_at: string;
  missed?: boolean;
};

type DeviceLike = {
  destroy: () => void;
  updateToken: (token: string) => void;
  connect: (options: { params: Record<string, string> }) => Promise<DeskCall>;
  // Twilio Device event handlers are loosely typed across SDK versions.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, handler: (...args: any[]) => void) => void;
  register: () => Promise<void>;
};

/** Website-chat transfers arrive as client:guest_* with the guest's name and phone attached. */
export function callerLabel(call: DeskCall | null) {
  if (!call) return "";
  const from = call.parameters?.From || "";
  if (from.startsWith("client:guest_")) {
    const guest = call.customParameters?.get("GuestName") || "Website guest";
    const guestPhone = call.customParameters?.get("GuestPhone");
    return `${guest}${guestPhone ? ` · ${guestPhone}` : ""} (website chat)`;
  }
  return from || call.parameters?.To || "";
}

export function callerPhone(call: DeskCall) {
  const from = call.parameters?.From || "";
  if (from.startsWith("client:")) return call.customParameters?.get("GuestPhone") || "";
  return from;
}

export function callbackNumber(call: CallRow) {
  return call.direction.startsWith("outbound") ? call.to : call.from;
}

export { formatAdminCallWhen as formatCallWhen } from "@/lib/admin-time";

type AdminVoiceContextValue = {
  status: string;
  phoneReady: boolean;
  phoneError: string | null;
  dialNumber: string;
  setDialNumber: (value: string | ((current: string) => string)) => void;
  incoming: DeskCall | null;
  active: DeskCall | null;
  muted: boolean;
  tones: string;
  calls: CallRow[];
  loadCalls: () => Promise<void>;
  /** Returns the normalized number dialed, or null if the call did not start. */
  placeCall: (to: string) => Promise<string | null>;
  answer: () => void;
  decline: () => void;
  hangUp: () => void;
  sendTone: (key: string) => void;
  toggleMute: () => void;
};

const AdminVoiceContext = createContext<AdminVoiceContextValue | null>(null);

export function useAdminVoice() {
  const value = useContext(AdminVoiceContext);
  if (!value) {
    throw new Error("useAdminVoice must be used within AdminVoiceProvider");
  }
  return value;
}

/**
 * Owns the Twilio Device for the whole admin session so nav between Desk,
 * Dashboard, Orders, etc. does not destroy an active call.
 */
export function AdminVoiceProvider({ children }: { children: ReactNode }) {
  const deviceRef = useRef<DeviceLike | null>(null);
  const [status, setStatus] = useState("Connecting the phone…");
  const [phoneReady, setPhoneReady] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [dialNumber, setDialNumber] = useState("");
  const [incoming, setIncoming] = useState<DeskCall | null>(null);
  const [active, setActive] = useState<DeskCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [tones, setTones] = useState("");
  const [calls, setCalls] = useState<CallRow[]>([]);

  const loadCalls = useCallback(async () => {
    const res = await fetch("/api/admin/voice/calls");
    if (!res.ok) return;
    const data = await res.json();
    setCalls(data.calls || []);
  }, []);

  useEffect(() => {
    void loadCalls();
    const timer = window.setInterval(() => void loadCalls(), 20000);
    return () => window.clearInterval(timer);
  }, [loadCalls]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      const res = await fetch("/api/admin/voice/token");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!cancelled && !deviceRef.current) {
          setPhoneReady(false);
          setStatus("Phone is not ready");
          setPhoneError(
            data.configured === false
              ? "Add the Twilio voice keys in the environment, then restart the server."
              : data.error || "Could not start the phone."
          );
        }
        return;
      }
      if (cancelled) return;
      if (deviceRef.current) {
        deviceRef.current.updateToken(data.token);
        return;
      }
      const { Device } = await import("@twilio/voice-sdk");
      if (cancelled) return;
      const device = new Device(data.token, { closeProtection: true }) as unknown as DeviceLike;
      device.on("registered", () => {
        setPhoneReady(true);
        setPhoneError(null);
        setStatus("Ready for calls");
      });
      device.on("unregistered", () => {
        setPhoneReady(false);
        setStatus("Phone disconnected");
      });
      device.on("error", (error: { message?: string }) => {
        setPhoneError(error.message || "The phone hit an error.");
      });
      device.on("incoming", (call: DeskCall) => {
        const label = callerLabel(call);
        setIncoming(call);
        setStatus(label ? `Incoming ${label}` : "Incoming call");
        call.on("cancel", () => {
          setIncoming((current) => (current === call ? null : current));
          setStatus("Ready for calls");
          void loadCalls();
        });
        call.on("disconnect", () => {
          setActive((current) => (current === call ? null : current));
          setIncoming((current) => (current === call ? null : current));
          setMuted(false);
          setTones("");
          setStatus("Ready for calls");
          void loadCalls();
        });
      });
      deviceRef.current = device;
      await device.register();
    }

    void connect();
    const refreshTimer = window.setInterval(() => void connect(), 50 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      deviceRef.current?.destroy();
      deviceRef.current = null;
    };
  }, [loadCalls]);

  useEffect(() => {
    document.body.dataset.adminBusy = active || incoming ? "1" : "";
    return () => {
      document.body.dataset.adminBusy = "";
    };
  }, [active, incoming]);

  const watchCall = useCallback(
    (call: DeskCall, label: string) => {
      setActive(call);
      setStatus(label);
      call.on("accept", () => setStatus("On a call"));
      call.on("disconnect", () => {
        setActive((current) => (current === call ? null : current));
        setMuted(false);
        setTones("");
        setStatus("Ready for calls");
        void loadCalls();
      });
    },
    [loadCalls]
  );

  const placeCall = useCallback(
    async (to: string) => {
      const device = deviceRef.current;
      if (!device || !phoneReady) return null;
      setPhoneError(null);
      const res = await fetch("/api/admin/voice/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhoneError(data.error || "Could not start the call.");
        return null;
      }
      try {
        const call = await device.connect({ params: { Ticket: data.ticket } });
        watchCall(call, `Calling ${data.to}`);
        return String(data.to || to);
      } catch (err) {
        setPhoneError(err instanceof Error ? err.message : "Could not start the call.");
        return null;
      }
    },
    [phoneReady, watchCall]
  );

  const answer = useCallback(() => {
    if (!incoming) return;
    incoming.accept();
    const label = callerLabel(incoming);
    setIncoming(null);
    watchCall(incoming, label ? `On a call with ${label}` : "On a call");
  }, [incoming, watchCall]);

  const decline = useCallback(() => {
    incoming?.reject();
    setIncoming(null);
    setStatus("Ready for calls");
    void loadCalls();
  }, [incoming, loadCalls]);

  const hangUp = useCallback(() => {
    active?.disconnect();
    incoming?.reject();
  }, [active, incoming]);

  const sendTone = useCallback(
    (key: string) => {
      if (!active) return;
      active.sendDigits(key);
      setTones((current) => (current + key).slice(-32));
    },
    [active]
  );

  const toggleMute = useCallback(() => {
    if (!active) return;
    const next = !muted;
    active.mute(next);
    setMuted(next);
  }, [active, muted]);

  const value = useMemo<AdminVoiceContextValue>(
    () => ({
      status,
      phoneReady,
      phoneError,
      dialNumber,
      setDialNumber,
      incoming,
      active,
      muted,
      tones,
      calls,
      loadCalls,
      placeCall,
      answer,
      decline,
      hangUp,
      sendTone,
      toggleMute,
    }),
    [
      status,
      phoneReady,
      phoneError,
      dialNumber,
      incoming,
      active,
      muted,
      tones,
      calls,
      loadCalls,
      placeCall,
      answer,
      decline,
      hangUp,
      sendTone,
      toggleMute,
    ]
  );

  return (
    <AdminVoiceContext.Provider value={value}>{children}</AdminVoiceContext.Provider>
  );
}
