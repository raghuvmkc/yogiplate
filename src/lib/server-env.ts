/** Read a server env var at runtime so Next does not bake the value into the build. */
export function serverEnv(name: string, fallback = "") {
  const env = process.env;
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
