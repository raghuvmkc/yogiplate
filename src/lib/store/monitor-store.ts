import fs from "fs/promises";
import path from "path";
import { blobsStore } from "@/lib/store/local-db";

export type SystemEvent = {
  id: string;
  at: string;
  area: string;
  message: string;
  path?: string;
  detail?: string;
};

export type MonitorState = {
  events: SystemEvent[];
  /** Last alert email per area, so one outage sends one email, not hundreds. */
  last_alert: Record<string, string>;
};

/** Kept apart from the main database so error logging never competes with order saves. */
const BLOB_KEY = "monitor";
const MAX_EVENTS = 200;
const localFile = () => path.join(process.cwd(), ".data", "monitor.json");

const empty = (): MonitorState => ({ events: [], last_alert: {} });

export async function readMonitor(): Promise<MonitorState> {
  try {
    const store = await blobsStore();
    const raw = store
      ? await store.get(BLOB_KEY, { type: "text" })
      : await fs.readFile(localFile(), "utf8");
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<MonitorState>;
    return { events: parsed.events || [], last_alert: parsed.last_alert || {} };
  } catch {
    return empty();
  }
}

export async function writeMonitor(state: MonitorState) {
  const body = JSON.stringify({
    events: state.events.slice(0, MAX_EVENTS),
    last_alert: state.last_alert,
  });
  const store = await blobsStore();
  if (store) {
    await store.set(BLOB_KEY, body);
    return;
  }
  await fs.mkdir(path.dirname(localFile()), { recursive: true });
  await fs.writeFile(localFile(), body);
}
