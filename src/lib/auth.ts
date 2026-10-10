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

/** Cookie holds "<last active ms>.<signature>" so the server can enforce the idle timeout. */
function sessionValue(lastActive: number) {
  const stamp = String(lastActive);
  return `${stamp}.${sign(stamp)}`;
}

function lastActiveFrom(value: string | undefined) {
  if (!value) return null;
  const [stamp, sig] = value.split(".");
  if (!stamp || !sig) return null;
  const expected = Buffer.from(sign(stamp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  const at = Number(stamp);
  return Number.isFinite(at) ? at : null;
}

export async function verifyAdmin(email: string, password: string) {
  const db = await getDb();
  if (email.toLowerCase() !== db.admin.email.toLowerCase()) return false;
  return bcrypt.compare(password, db.admin.password_hash);
}

export async function setAdminSession() {
  const jar = await cookies();
  jar.set(COOKIE, sessionValue(Date.now()), {
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

export async function isAdminAuthenticated() {
  const jar = await cookies();
  const at = lastActiveFrom(jar.get(COOKIE)?.value);
  if (at == null) return false;
  const age = Date.now() - at;
  return age >= -60_000 && age <= ADMIN_IDLE_MS;
}

/** Called while the manager is actively using the admin; pushes the idle timeout back. */
export async function touchAdminSession() {
  if (!(await isAdminAuthenticated())) return false;
  await setAdminSession();
  return true;
}

export async function requireAdmin() {
  const ok = await isAdminAuthenticated();
  if (!ok) throw new Error("Unauthorized");
}
