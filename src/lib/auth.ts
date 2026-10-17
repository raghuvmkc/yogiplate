import crypto from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/store/local-db";
import { serverEnv } from "@/lib/server-env";

const COOKIE = "yogiplate_admin";

/** Admin is signed out after this long with no mouse, keyboard, or touch activity. */
export const ADMIN_IDLE_MS = 30 * 60 * 1000;

function sign(value: string) {
  return crypto
    .createHmac("sha256", serverEnv("ADMIN_SESSION_SECRET", "yogiplate-session"))
    .update(value)
    .digest("base64url");
}

/**
 * Cookie holds "<emailBase64url>.<last active ms>.<signature>" so the server knows
 * which admin is signed in (refunds are owner-only).
 * Older cookies were "<last active ms>.<signature>" and still validate for auth.
 */
function sessionValue(email: string, lastActive: number) {
  const payload = `${base64url(email)}.${lastActive}`;
  return `${payload}.${sign(payload)}`;
}

function base64url(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function parseSession(value: string | undefined): { email: string | null; at: number } | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length === 2) {
    const [stamp, sig] = parts;
    if (!stamp || !sig) return null;
    const expected = Buffer.from(sign(stamp));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const at = Number(stamp);
    return Number.isFinite(at) ? { email: null, at } : null;
  }
  if (parts.length === 3) {
    const [emailPart, stamp, sig] = parts;
    if (!emailPart || !stamp || !sig) return null;
    const payload = `${emailPart}.${stamp}`;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const at = Number(stamp);
    if (!Number.isFinite(at)) return null;
    try {
      return { email: fromBase64url(emailPart).toLowerCase(), at };
    } catch {
      return null;
    }
  }
  return null;
}

export async function verifyAdmin(email: string, password: string) {
  const db = await getDb();
  if (email.toLowerCase() !== db.admin.email.toLowerCase()) return false;
  return bcrypt.compare(password, db.admin.password_hash);
}

export async function setAdminSession(email?: string) {
  const jar = await cookies();
  const resolved =
    (email || "").trim().toLowerCase() ||
    (await getDb()).admin.email.toLowerCase();
  jar.set(COOKIE, sessionValue(resolved, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getAdminSessionEmail() {
  const jar = await cookies();
  const parsed = parseSession(jar.get(COOKIE)?.value);
  if (!parsed) return null;
  const age = Date.now() - parsed.at;
  if (age < -60_000 || age > ADMIN_IDLE_MS) return null;
  return parsed.email;
}

export async function isAdminAuthenticated() {
  const jar = await cookies();
  const parsed = parseSession(jar.get(COOKIE)?.value);
  if (!parsed) return false;
  const age = Date.now() - parsed.at;
  return age >= -60_000 && age <= ADMIN_IDLE_MS;
}

/** Called while the manager is actively using the admin; pushes the idle timeout back. */
export async function touchAdminSession() {
  if (!(await isAdminAuthenticated())) return false;
  const email = (await getAdminSessionEmail()) || (await getDb()).admin.email;
  await setAdminSession(email);
  return true;
}

export async function requireAdmin() {
  const ok = await isAdminAuthenticated();
  if (!ok) throw new Error("Unauthorized");
}

/** Only the owner account may issue refunds from the calendar. */
export function refundOwnerEmail() {
  return (
    serverEnv("REFUND_ADMIN_EMAIL") ||
    serverEnv("ADMIN_EMAIL") ||
    ""
  ).trim().toLowerCase();
}

export async function canIssueRefunds() {
  if (!(await isAdminAuthenticated())) return false;
  const owner = refundOwnerEmail();
  if (!owner) return false;
  const email = await getAdminSessionEmail();
  if (email) return email === owner;
  // Legacy session without email: allow only when owner is the single ADMIN_EMAIL.
  const adminEmail = serverEnv("ADMIN_EMAIL").trim().toLowerCase();
  return Boolean(adminEmail) && owner === adminEmail;
}
