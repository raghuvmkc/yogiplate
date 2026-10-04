import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/store/local-db";
import { serverEnv } from "@/lib/server-env";

const COOKIE = "yogiplate_admin";

export async function verifyAdmin(email: string, password: string) {
  const db = await getDb();
  if (email.toLowerCase() !== db.admin.email.toLowerCase()) return false;
  return bcrypt.compare(password, db.admin.password_hash);
}

export async function setAdminSession() {
  const jar = await cookies();
  jar.set(COOKIE, serverEnv("ADMIN_SESSION_SECRET", "yogiplate-session"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAdminAuthenticated() {
  const jar = await cookies();
  const val = jar.get(COOKIE)?.value;
  return Boolean(val && val === serverEnv("ADMIN_SESSION_SECRET", "yogiplate-session"));
}

export async function requireAdmin() {
  const ok = await isAdminAuthenticated();
  if (!ok) throw new Error("Unauthorized");
}
