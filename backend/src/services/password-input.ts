const MAX_PASSWORD_LENGTH = 1024;

// Single entry point for every password, so a password set in one Unicode form always signs in.
// Returns null for input the system refuses (not a string, too long, lone surrogates).
export function normalizePassword(plain: string): string | null {
  if (typeof plain !== "string") return null;
  if (plain.length > MAX_PASSWORD_LENGTH || !plain.isWellFormed()) return null;
  return plain.normalize("NFKC");
}
