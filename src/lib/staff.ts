import { decimalHours, formatKitchenTime, formatShiftLength, pinFromMonthDay } from "@/lib/staff-time";
import { getDb, uid, updateDb } from "@/lib/store/local-db";
import type { KitchenEmployee, TimePunch } from "@/lib/types";

export type PunchResult =
  | { choose: { id: string; name: string }[] }
  | {
      action: "in" | "out";
      name: string;
      message: string;
      shift?: string;
    };

/** Check in, or check out if this person is already in the kitchen. */
export async function clockByPin(pin: string, employeeId?: string): Promise<PunchResult> {
  const code = String(pin || "").replace(/\D/g, "");
  if (!/^\d{4}$/.test(code)) {
    throw new Error("Enter four digits: two for the month, two for the birthday.");
  }

  const db = await getDb();
  const matches = (db.employees || []).filter((row) => row.active && row.pin === code);
  if (!matches.length) throw new Error("That code is not on the kitchen list.");
  if (matches.length > 1 && !employeeId) {
    return { choose: matches.map((row) => ({ id: row.id, name: row.name })) };
  }
  const employee = employeeId ? matches.find((row) => row.id === employeeId) : matches[0];
  if (!employee) throw new Error("Choose your name.");

  const now = new Date().toISOString();
  const outcome: { action: "in" | "out"; shift: string } = { action: "in", shift: "" };

  await updateDb((next) => {
    const people = next.employees || [];
    const person = people.find((row) => row.id === employee.id && row.active && row.pin === code);
    if (!person) throw new Error("That code is not on the kitchen list.");
    const punches = next.time_punches || (next.time_punches = []);
    const open = [...punches].reverse().find((row) => row.employee_id === person.id && !row.out_at);
    if (open) {
      open.out_at = now;
      outcome.action = "out";
      outcome.shift = formatShiftLength(open.in_at, now);
    } else {
      punches.push({
        id: uid("punch"),
        employee_id: person.id,
        in_at: now,
        out_at: null,
      });
      outcome.action = "in";
    }
  });

  if (outcome.action === "out") {
    return {
      action: "out" as const,
      name: employee.name,
      shift: outcome.shift,
      message: `See you, ${employee.name}. Today: ${outcome.shift}.`,
    };
  }
  return {
    action: "in" as const,
    name: employee.name,
    message: `Welcome, ${employee.name}. Have a good day.`,
  };
}

export async function saveEmployee(input: {
  id?: string;
  name: string;
  month: number;
  day: number;
  active?: boolean;
}) {
  const name = String(input.name || "").trim();
  if (name.length < 2) throw new Error("Enter the employee's name.");
  const pin = pinFromMonthDay(input.month, input.day);
  const now = new Date().toISOString();

  await updateDb((db) => {
    const employees = db.employees || (db.employees = []);
    if (input.id) {
      const row = employees.find((item) => item.id === input.id);
      if (!row) throw new Error("Employee not found.");
      row.name = name;
      row.pin = pin;
      if (input.active != null) row.active = input.active;
      return;
    }
    const row: KitchenEmployee = {
      id: uid("emp"),
      name,
      pin,
      active: input.active !== false,
      created_at: now,
    };
    employees.push(row);
  });
}

export async function clockOutPunch(punchId: string) {
  const now = new Date().toISOString();
  await updateDb((db) => {
    const punch = (db.time_punches || []).find((row) => row.id === punchId && !row.out_at);
    if (!punch) throw new Error("That shift is already closed.");
    punch.out_at = now;
  });
}

export type StaffSnapshot = {
  employees: KitchenEmployee[];
  open: {
    punch_id: string;
    employee_id: string;
    name: string;
    in_at: string;
    so_far: string;
  }[];
  history: {
    punch_id: string;
    name: string;
    pin: string;
    in_at: string;
    out_at: string | null;
    length: string;
  }[];
};

export async function staffSnapshot(historyLimit = 80): Promise<StaffSnapshot> {
  const db = await getDb();
  const employees = [...(db.employees || [])].sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(employees.map((row) => [row.id, row]));
  const now = new Date().toISOString();
  const punches = [...(db.time_punches || [])].sort((a, b) => b.in_at.localeCompare(a.in_at));

  const open = punches
    .filter((row) => !row.out_at)
    .map((row) => ({
      punch_id: row.id,
      employee_id: row.employee_id,
      name: byId.get(row.employee_id)?.name || "Unknown",
      in_at: row.in_at,
      so_far: formatShiftLength(row.in_at, now),
    }))
    .sort((a, b) => a.in_at.localeCompare(b.in_at));

  const history = punches.slice(0, historyLimit).map((row) => describePunch(row, byId, now));
  return { employees, open, history };
}

function describePunch(
  row: TimePunch,
  byId: Map<string, KitchenEmployee>,
  now: string
) {
  const end = row.out_at || now;
  return {
    punch_id: row.id,
    name: byId.get(row.employee_id)?.name || "Unknown",
    pin: byId.get(row.employee_id)?.pin || "",
    in_at: row.in_at,
    out_at: row.out_at,
    length: row.out_at ? formatShiftLength(row.in_at, end) : "",
  };
}

export async function staffHistoryCsv() {
  const db = await getDb();
  const byId = new Map((db.employees || []).map((row) => [row.id, row]));
  const now = new Date().toISOString();
  const rows = [...(db.time_punches || [])].sort((a, b) => a.in_at.localeCompare(b.in_at));
  const lines = [
    "Name,Code,Clock in (Pacific),Clock out (Pacific),Hours,Still in",
    ...rows.map((row) => {
      const person = byId.get(row.employee_id);
      const end = row.out_at || now;
      return [
        csv(person?.name || "Unknown"),
        csv(person?.pin || ""),
        csv(formatKitchenTime(row.in_at)),
        csv(row.out_at ? formatKitchenTime(row.out_at) : ""),
        decimalHours(row.in_at, end),
        row.out_at ? "no" : "yes",
      ].join(",");
    }),
  ];
  return lines.join("\n");
}

function csv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
