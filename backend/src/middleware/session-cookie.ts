import type { Request, Response } from "express";
import { isValidSessionId } from "../services/sessions.js";

const NAME = "__session";
const MAX_AGE_SECONDS = 14 * 86_400;
// Secure is unconditional: behind the proxy `req.secure` cannot be trusted to decide it.
const attrs = (maxAge: number) => `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

// Scans every `__session` value: a junk first value must not hide a real one. Only a well-formed
// id is returned as `id`, so nothing else can reach the database; `present` says a value was sent.
export function readSession(req: Request): { id: string | null; present: boolean } {
  let present = false;
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== NAME) continue;
    present = true;
    const value = part.slice(eq + 1).trim();
    if (isValidSessionId(value)) return { id: value, present };
  }
  return { id: null, present };
}

export const readSessionId = (req: Request): string | null => readSession(req).id;

export const setSessionCookie = (res: Response, id: string): void => {
  res.append("Set-Cookie", `${NAME}=${id}; ${attrs(MAX_AGE_SECONDS)}`);
};

export const clearSessionCookie = (res: Response): void => {
  res.append("Set-Cookie", `${NAME}=; ${attrs(0)}`);
};
