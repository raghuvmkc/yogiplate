/**
 * Read a server env var at runtime so Next does not bake the value into the build.
 * Tolerates values pasted as `NAME=value` or wrapped in quotes in a hosting dashboard.
 */
export function serverEnv(name: string, fallback = "") {
  const raw = process.env[name];
  if (typeof raw !== "string") return fallback;
  let value = raw.trim();
  if (value.startsWith(`${name}=`)) value = value.slice(name.length + 1).trim();
  value = value.replace(/^(["'])(.*)\1$/, "$2").trim();
  return value || fallback;
}
