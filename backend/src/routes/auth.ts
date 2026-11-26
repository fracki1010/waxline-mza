import { Router } from "express";
import { sendError } from "../middleware/errors.js";
import { requireStaff } from "../middleware/require-staff.js";
import {
  clearSessionCookie,
  readSessionId,
  setSessionCookie,
} from "../middleware/session-cookie.js";
import { DUMMY_HASH, verifyPassword } from "../services/hash.js";
import { normalizePassword } from "../services/password-input.js";

const MAX_USERNAME = 64;
// Bounds concurrent argon2 work (CPU and memory) and the lock-check race window.
const MAX_VERIFICATIONS = 4;

function parseCredentials(body: unknown): { username: string; password: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { username, password } = body as Record<string, unknown>;
  if (typeof username !== "string" || typeof password !== "string") return null;
  const length = username.trim().length;
  if (length < 1 || length > MAX_USERNAME || !username.isWellFormed() || password.length === 0) {
    return null;
  }
  const normalised = normalizePassword(password);
  return normalised === null ? null : { username, password: normalised };
}

export function createAuthRouter(): Router {
  const router = Router();
  let verifying = 0;

  router.post("/sign-in", async (req, res) => {
    const { lockout, sessions, staff } = req.app.locals.services;
    const now: Date = res.locals.now;
    const credentials = parseCredentials(req.body);
    if (credentials === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Username and password are required.");
      return;
    }
    const { username, password } = credentials;
    if (verifying >= MAX_VERIFICATIONS) {
      sendError(res, 429, "TOO_MANY_REQUESTS", "Server is busy. Try again shortly.");
      return;
    }
    verifying++;
    let member;
    let valid;
    try {
      // Counts this attempt up front, so a failed guess is never counted a second time.
      if (!(await lockout.reserve(username, now))) {
        sendError(res, 429, "LOCKED", "Too many failed attempts. Try again later.");
        return;
      }
      member = await staff.findByUsername(username);
      // Unknown usernames pay the same hashing cost against a dummy hash.
      valid = await verifyPassword(password, member?.passwordHash ?? DUMMY_HASH);
    } finally {
      verifying--;
    }
    if (member === null || !valid) {
      sendError(res, 401, "INVALID_CREDENTIALS", "Incorrect username or password.");
      return;
    }
    await lockout.clear(username);
    // A shared device: the previous member's session must not outlive this sign-in.
    const previous = readSessionId(req);
    if (previous !== null) await sessions.destroy(previous);
    const { id } = await sessions.create(member.id, now);
    setSessionCookie(res, id);
    res.json({ user: { id: member.id, displayName: member.displayName } });
  });

  router.post("/sign-out", async (req, res) => {
    const id = readSessionId(req);
    if (id !== null) await req.app.locals.services.sessions.destroy(id);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get("/me", requireStaff, (_req, res) => {
    res.json({ user: res.locals.staff });
  });

  return router;
}
