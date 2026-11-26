export interface Config {
  mongoUri: string;
  port: number;
  allowedOrigins: string[];
}

const fail = (name: string, why: string): never => {
  throw new Error(`${name} ${why}`);
};

export function loadConfig(env: Record<string, string | undefined>): Config {
  const mongoUri = env.MONGODB_URI?.trim();
  if (!mongoUri) fail("MONGODB_URI", "is required");

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        const url = new URL(entry);
        if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
        return url.origin;
      } catch {
        return fail("ALLOWED_ORIGINS", "must hold http(s) URLs");
      }
    });
  if (allowedOrigins.length === 0) fail("ALLOWED_ORIGINS", "is required");

  const rawPort = env.PORT?.trim() ?? "";
  const port = rawPort === "" ? 8080 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("PORT", "must be an integer from 1 to 65535");
  }
  return { mongoUri: mongoUri!, port, allowedOrigins };
}
