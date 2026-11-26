import type { Db } from "mongodb";
import { DuplicateUsernameError, createStaffModel, ensureStaffIndexes } from "../models/staff.js";
import { hashPassword } from "../services/hash.js";
import { normalizePassword } from "../services/password-input.js";

export const MIN_PASSWORD_LENGTH = 10;

export class InvalidPasswordError extends Error {
  constructor() {
    super(`Password must be at least ${MIN_PASSWORD_LENGTH} characters and at most 1024`);
    this.name = "InvalidPasswordError";
  }
}

export async function createFirstStaff(input: {
  db: Db;
  username: string;
  displayName: string;
  password: string;
  now: Date;
}): Promise<{ id: string }> {
  // Normalise first and measure after, so the stored hash matches what sign-in will compute.
  const password = normalizePassword(input.password);
  if (password === null || password.length < MIN_PASSWORD_LENGTH) throw new InvalidPasswordError();
  await ensureStaffIndexes(input.db);
  const passwordHash = await hashPassword(password);
  return createStaffModel(input.db).createStaff(
    { username: input.username, displayName: input.displayName, passwordHash },
    input.now,
  );
}

export function parseArgs(args: string[]): { username: string; displayName: string } | null {
  const [username, displayName, ...rest] = args;
  if (username === undefined || displayName === undefined || rest.length > 0) return null;
  return { username, displayName };
}

export const exitCodeFor = (error: unknown): 0 | 1 => (error === undefined ? 0 : 1);

// Only our own fixed messages are echoed; driver errors can embed the connection string.
export function describeFailure(error: unknown): string {
  if (
    error instanceof DuplicateUsernameError ||
    error instanceof InvalidPasswordError ||
    error instanceof TypeError
  ) {
    return error.message;
  }
  return "Could not create the account";
}
