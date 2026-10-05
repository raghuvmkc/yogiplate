/** Typed guest-event memory for the catering planning agent (Phase 1). */

export type HeadcountSegmentKey =
  | "adults"
  | "kids"
  | "toddlers"
  | "jain"
  | "vegan"
  | "swaminarayan"
  | "pushtimarg"
  | "allergy"
  | "other";

export type RequirementKind =
  | "jain"
  | "vegan"
  | "swaminarayan"
  | "pushtimarg"
  | "allergy"
  | "spice_mild"
  | "kid_friendly"
  | "no_onion_garlic"
  | "gluten_sensitive"
  | "other";

export type MemoryOpType =
  | "add"
  | "update"
  | "remove"
  | "flag_conflict"
  | "ask_clarification";

export type MemoryPath =
  | "event"
  | "headcount"
  | "headcount.segments"
  | "requirement_groups"
  | "timeline"
  | "open_questions"
  | "declined_suggestions"
  | "preferences"
  | "notes";

export interface HeadcountSegment {
  key: HeadcountSegmentKey;
  count: number;
  label?: string;
}

export interface RequirementGroup {
  id: string;
  kind: RequirementKind;
  count: number;
  /** Free-text allergen when kind is allergy — never invent kitchen capability. */
  allergen?: string;
  notes?: string;
  dedicated_tray?: boolean;
}

export interface TimelineSlot {
  id: string;
  label: string;
  /** HH:mm local */
  time?: string;
  headcount?: number;
  notes?: string;
}

export interface OpenQuestion {
  id: string;
  prompt: string;
  priority?: "high" | "normal";
  created_at: string;
}

export interface MemoryChangeLogEntry {
  at: string;
  op: MemoryOpType;
  path: string;
  detail: string;
}

export interface GuestEventMemory {
  event_id: string;
  session_id: string;
  customer_email: string;
  event: {
    occasion?: string;
    date?: string;
    meal_time?: string;
    meal?: "lunch" | "dinner" | "brunch" | "snack" | "";
    delivery_or_pickup?: "delivery" | "pickup" | "";
    city?: string;
    address?: string;
    budget?: number | null;
  };
  headcount: {
    total: number | null;
    segments: HeadcountSegment[];
  };
  requirement_groups: RequirementGroup[];
  timeline: TimelineSlot[];
  open_questions: OpenQuestion[];
  declined_suggestions: string[];
  preferences: string[];
  notes: string[];
  /** Last build_plan menu. Quotes use this so dishes are not replaced by a short package. */
  planned_menu?: {
    menu_item_id: string;
    variant_id?: string;
    name: string;
    quantity: number;
    unit: string;
    price: number;
    reason?: string;
  }[];
  change_log: MemoryChangeLogEntry[];
  conflicts: string[];
  chef_mentions: number;
  updated_at: string;
  created_at: string;
}

export type MemoryOp = {
  op: MemoryOpType;
  path: MemoryPath | string;
  /** Segment key, requirement id/kind, or field name depending on path */
  key?: string;
  value?: unknown;
  message?: string;
};

export type ApplyOpsResult = {
  ok: boolean;
  memory: GuestEventMemory;
  applied: number;
  errors: string[];
  conflicts: string[];
  clarifications: string[];
};

const SEGMENT_KEYS = new Set<string>([
  "adults",
  "kids",
  "toddlers",
  "jain",
  "vegan",
  "swaminarayan",
  "pushtimarg",
  "allergy",
  "other",
]);

const REQUIREMENT_KINDS = new Set<string>([
  "jain",
  "vegan",
  "swaminarayan",
  "pushtimarg",
  "allergy",
  "spice_mild",
  "kid_friendly",
  "no_onion_garlic",
  "gluten_sensitive",
  "other",
]);

function nowIso() {
  return new Date().toISOString();
}

function log(
  memory: GuestEventMemory,
  op: MemoryOpType,
  path: string,
  detail: string
) {
  memory.change_log.push({ at: nowIso(), op, path, detail });
  if (memory.change_log.length > 80) {
    memory.change_log = memory.change_log.slice(-80);
  }
}

export function emptyGuestMemory(input: {
  event_id: string;
  session_id: string;
  customer_email: string;
}): GuestEventMemory {
  const t = nowIso();
  return {
    event_id: input.event_id,
    session_id: input.session_id,
    customer_email: input.customer_email.toLowerCase().trim(),
    event: {},
    headcount: { total: null, segments: [] },
    requirement_groups: [],
    timeline: [],
    open_questions: [],
    declined_suggestions: [],
    preferences: [],
    notes: [],
    change_log: [],
    conflicts: [],
    chef_mentions: 0,
    created_at: t,
    updated_at: t,
  };
}

function nonNegInt(n: unknown): number | null {
  if (n == null || n === "") return null;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) return null;
  return v;
}

function segmentSum(segments: HeadcountSegment[]): number {
  return segments.reduce((s, seg) => s + (seg.count || 0), 0);
}

/** Recompute conflicts from current headcount + requirement groups. */
export function recomputeConflicts(memory: GuestEventMemory): string[] {
  const conflicts: string[] = [];
  const total = memory.headcount.total;
  const sum = segmentSum(memory.headcount.segments);
  if (total != null && sum > 0 && sum !== total) {
    conflicts.push(
      `Headcount conflict: total ${total} vs segment sum ${sum}`
    );
  }
  for (const g of memory.requirement_groups) {
    if (g.count < 0) {
      conflicts.push(`Requirement ${g.kind} has negative count`);
      continue;
    }
    if (total != null && g.count > total) {
      conflicts.push(
        `Requirement ${g.kind} count ${g.count} exceeds total headcount ${total}`
      );
    }
    const seg = memory.headcount.segments.find((s) => s.key === g.kind);
    if (seg && g.count > seg.count) {
      conflicts.push(
        `Requirement ${g.kind} count ${g.count} exceeds segment ${seg.count}`
      );
    }
  }
  memory.conflicts = conflicts;
  return conflicts;
}

function upsertSegment(
  memory: GuestEventMemory,
  key: HeadcountSegmentKey,
  count: number,
  label?: string
) {
  const idx = memory.headcount.segments.findIndex((s) => s.key === key);
  if (idx >= 0) {
    memory.headcount.segments[idx] = {
      ...memory.headcount.segments[idx],
      count,
      ...(label != null ? { label } : {}),
    };
  } else {
    memory.headcount.segments.push({ key, count, label });
  }
}

function upsertRequirement(
  memory: GuestEventMemory,
  kind: RequirementKind,
  count: number,
  extra?: Partial<RequirementGroup>
) {
  const allergen = extra?.allergen?.toLowerCase().trim();
  const idx = memory.requirement_groups.findIndex((g) => {
    if (g.kind !== kind) return false;
    if (kind === "allergy") {
      return (g.allergen || "").toLowerCase() === (allergen || "");
    }
    return true;
  });
  if (idx >= 0) {
    memory.requirement_groups[idx] = {
      ...memory.requirement_groups[idx],
      count,
      ...extra,
      allergen:
        kind === "allergy"
          ? allergen || memory.requirement_groups[idx].allergen
          : undefined,
    };
  } else {
    memory.requirement_groups.push({
      id: `req_${kind}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      count,
      ...extra,
      allergen: kind === "allergy" ? allergen : undefined,
    });
  }
}

function applyEventField(
  memory: GuestEventMemory,
  key: string,
  value: unknown,
  op: MemoryOpType
): string | null {
  const event = memory.event as Record<string, unknown>;
  const allowed = [
    "occasion",
    "date",
    "meal_time",
    "meal",
    "delivery_or_pickup",
    "city",
    "address",
    "budget",
  ];
  if (!allowed.includes(key)) return `Unknown event field: ${key}`;
  if (op === "remove") {
    delete event[key];
    log(memory, op, `event.${key}`, "removed");
    return null;
  }
  if (key === "budget") {
    if (value == null || value === "") {
      event.budget = null;
    } else {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return "budget must be non-negative";
      event.budget = n;
    }
  } else {
    event[key] = value == null ? "" : String(value);
  }
  log(memory, op, `event.${key}`, String(event[key]));
  return null;
}

/**
 * Validate and apply memory operations. Corrections upsert (no duplicate Jain rows).
 */
export function applyMemoryOps(
  memory: GuestEventMemory,
  ops: MemoryOp[]
): ApplyOpsResult {
  const errors: string[] = [];
  const clarifications: string[] = [];
  let applied = 0;

  for (const raw of ops) {
    const op = raw.op;
    const path = String(raw.path || "");
    if (
      !["add", "update", "remove", "flag_conflict", "ask_clarification"].includes(
        op
      )
    ) {
      errors.push(`Invalid op: ${op}`);
      continue;
    }

    if (op === "ask_clarification") {
      const prompt = String(raw.message || raw.value || "").trim();
      if (!prompt) {
        errors.push("ask_clarification requires message");
        continue;
      }
      const id = `q_${Math.random().toString(36).slice(2, 8)}`;
      memory.open_questions.push({
        id,
        prompt,
        priority: "normal",
        created_at: nowIso(),
      });
      clarifications.push(prompt);
      log(memory, op, "open_questions", prompt);
      applied++;
      continue;
    }

    if (op === "flag_conflict") {
      const msg = String(raw.message || raw.value || "Conflict flagged").trim();
      if (!memory.conflicts.includes(msg)) memory.conflicts.push(msg);
      log(memory, op, path || "conflicts", msg);
      applied++;
      continue;
    }

    if (path === "event" || path.startsWith("event.")) {
      const key = path === "event" ? String(raw.key || "") : path.slice(6);
      if (!key) {
        errors.push("event op needs key");
        continue;
      }
      const err = applyEventField(memory, key, raw.value, op);
      if (err) errors.push(err);
      else applied++;
      continue;
    }

    if (path === "headcount" || path === "headcount.total") {
      if (op === "remove") {
        memory.headcount.total = null;
        log(memory, op, "headcount.total", "cleared");
        applied++;
        continue;
      }
      const n = nonNegInt(raw.value);
      if (n == null) {
        errors.push("headcount.total must be a non-negative integer");
        continue;
      }
      memory.headcount.total = n;
      log(memory, op, "headcount.total", String(n));
      applied++;
      continue;
    }

    if (path === "headcount.segments" || path.startsWith("headcount.segments")) {
      const key = String(raw.key || "").toLowerCase();
      if (!SEGMENT_KEYS.has(key)) {
        errors.push(`Invalid segment key: ${key}`);
        continue;
      }
      if (op === "remove") {
        memory.headcount.segments = memory.headcount.segments.filter(
          (s) => s.key !== key
        );
        log(memory, op, `headcount.segments.${key}`, "removed");
        applied++;
        continue;
      }
      const n = nonNegInt(raw.value);
      if (n == null) {
        errors.push(`Segment ${key} count must be non-negative integer`);
        continue;
      }
      upsertSegment(
        memory,
        key as HeadcountSegmentKey,
        n,
        raw.message ? String(raw.message) : undefined
      );
      log(memory, op, `headcount.segments.${key}`, String(n));
      applied++;
      continue;
    }

    if (
      path === "requirement_groups" ||
      path.startsWith("requirement_groups")
    ) {
      const kind = String(raw.key || "").toLowerCase();
      if (!REQUIREMENT_KINDS.has(kind)) {
        errors.push(`Invalid requirement kind: ${kind}`);
        continue;
      }
      const valueObj =
        raw.value && typeof raw.value === "object"
          ? (raw.value as Record<string, unknown>)
          : null;
      const allergen =
        (valueObj?.allergen != null
          ? String(valueObj.allergen)
          : raw.message) || undefined;

      if (op === "remove") {
        memory.requirement_groups = memory.requirement_groups.filter((g) => {
          if (g.kind !== kind) return true;
          if (kind === "allergy" && allergen) {
            return (g.allergen || "").toLowerCase() !== allergen.toLowerCase();
          }
          return false;
        });
        log(memory, op, `requirement_groups.${kind}`, "removed");
        applied++;
        continue;
      }

      const countRaw = valueObj?.count != null ? valueObj.count : raw.value;
      const n = nonNegInt(countRaw);
      if (n == null) {
        errors.push(`Requirement ${kind} count must be non-negative integer`);
        continue;
      }
      if (kind === "allergy" && !allergen) {
        errors.push("allergy requirement needs allergen text");
        continue;
      }
      upsertRequirement(memory, kind as RequirementKind, n, {
        allergen,
        notes: valueObj?.notes != null ? String(valueObj.notes) : undefined,
        dedicated_tray:
          valueObj?.dedicated_tray != null
            ? Boolean(valueObj.dedicated_tray)
            : kind === "jain" ||
              kind === "vegan" ||
              kind === "allergy" ||
              undefined,
      });
      // Keep matching headcount segment in sync for diet kinds
      if (
        ["jain", "vegan", "swaminarayan", "pushtimarg", "allergy"].includes(kind)
      ) {
        upsertSegment(memory, kind as HeadcountSegmentKey, n);
      }
      log(
        memory,
        op,
        `requirement_groups.${kind}`,
        kind === "allergy" ? `${n} (${allergen})` : String(n)
      );
      applied++;
      continue;
    }

    if (path === "declined_suggestions") {
      const item = String(raw.value || raw.message || "").trim();
      if (!item) {
        errors.push("declined_suggestions needs value");
        continue;
      }
      if (op === "remove") {
        memory.declined_suggestions = memory.declined_suggestions.filter(
          (x) => x.toLowerCase() !== item.toLowerCase()
        );
      } else if (
        !memory.declined_suggestions.some(
          (x) => x.toLowerCase() === item.toLowerCase()
        )
      ) {
        memory.declined_suggestions.push(item);
      }
      log(memory, op, "declined_suggestions", item);
      applied++;
      continue;
    }

    if (path === "preferences" || path === "notes") {
      const list = path === "preferences" ? memory.preferences : memory.notes;
      const item = String(raw.value || raw.message || "").trim();
      if (!item) {
        errors.push(`${path} needs value`);
        continue;
      }
      if (op === "remove") {
        const next = list.filter((x) => x.toLowerCase() !== item.toLowerCase());
        if (path === "preferences") memory.preferences = next;
        else memory.notes = next;
      } else if (!list.some((x) => x.toLowerCase() === item.toLowerCase())) {
        list.push(item);
      }
      log(memory, op, path, item);
      applied++;
      continue;
    }

    if (path === "timeline") {
      if (op === "remove") {
        const id = String(raw.key || "");
        memory.timeline = memory.timeline.filter((t) => t.id !== id);
        log(memory, op, "timeline", `removed ${id}`);
        applied++;
        continue;
      }
      const v =
        raw.value && typeof raw.value === "object"
          ? (raw.value as Record<string, unknown>)
          : {};
      const label = String(v.label || raw.message || "slot").trim();
      const id = String(raw.key || v.id || `tl_${Math.random().toString(36).slice(2, 8)}`);
      const existing = memory.timeline.findIndex((t) => t.id === id);
      const slot: TimelineSlot = {
        id,
        label,
        time: v.time != null ? String(v.time) : undefined,
        headcount:
          v.headcount != null ? nonNegInt(v.headcount) ?? undefined : undefined,
        notes: v.notes != null ? String(v.notes) : undefined,
      };
      if (existing >= 0) memory.timeline[existing] = slot;
      else memory.timeline.push(slot);
      log(memory, op, "timeline", label);
      applied++;
      continue;
    }

    if (path === "open_questions" && op === "remove") {
      const id = String(raw.key || raw.value || "");
      memory.open_questions = memory.open_questions.filter((q) => q.id !== id);
      log(memory, op, "open_questions", `resolved ${id}`);
      applied++;
      continue;
    }

    errors.push(`Unsupported path: ${path}`);
  }

  const conflicts = recomputeConflicts(memory);
  memory.updated_at = nowIso();

  return {
    ok: errors.length === 0,
    memory,
    applied,
    errors,
    conflicts,
    clarifications,
  };
}

/** Compact summary for prompt injection. */
export function summarizeGuestMemory(memory: GuestEventMemory): string {
  const parts: string[] = [];
  if (memory.event.occasion) parts.push(`occasion=${memory.event.occasion}`);
  if (memory.event.date) parts.push(`date=${memory.event.date}`);
  if (memory.event.meal) parts.push(`meal=${memory.event.meal}`);
  if (memory.headcount.total != null)
    parts.push(`total=${memory.headcount.total}`);
  if (memory.headcount.segments.length) {
    parts.push(
      `segments=${memory.headcount.segments
        .map((s) => `${s.key}:${s.count}`)
        .join(",")}`
    );
  }
  if (memory.requirement_groups.length) {
    parts.push(
      `requirements=${memory.requirement_groups
        .map((g) =>
          g.kind === "allergy"
            ? `${g.kind}:${g.count}:${g.allergen || "?"}`
            : `${g.kind}:${g.count}`
        )
        .join(";")}`
    );
  }
  if (memory.declined_suggestions.length) {
    parts.push(`declined=${memory.declined_suggestions.join("|")}`);
  }
  if (memory.conflicts.length) {
    parts.push(`CONFLICTS=${memory.conflicts.join(" | ")}`);
  }
  if (memory.open_questions.length) {
    parts.push(
      `open_q=${memory.open_questions.map((q) => q.prompt).join(" | ")}`
    );
  }
  return parts.join("; ") || "(empty)";
}
