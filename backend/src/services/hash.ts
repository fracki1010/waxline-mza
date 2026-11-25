import { argon2, argon2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// Callers must bound the plaintext length (the route validates it); no limit is enforced here.

const argon2Async = promisify(argon2);

// OWASP minimum for argon2id.
const MEMORY = 19456;
const PASSES = 2;
const PARALLELISM = 1;
const TAG_LENGTH = 32;
const SALT_LENGTH = 16;

// Caps on parameters read from a stored hash: a poisoned hash must not become a DoS.
const MAX_MEMORY = 65536;
const MAX_PASSES = 10;
const MAX_PARALLELISM = 4;
const MIN_SALT = 8;
const MAX_SALT = 64;
const MIN_TAG = 16;
const MAX_TAG = 64;

const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");
const encode = (m: number, t: number, p: number, salt: Buffer, tag: Buffer) =>
  `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(tag)}`;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const tag = await argon2Async("argon2id", {
    message: plain,
    nonce: salt,
    memory: MEMORY,
    passes: PASSES,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
  });
  return encode(MEMORY, PASSES, PARALLELISM, salt, tag);
}

const STRICT_B64 = /^[A-Za-z0-9+/]+$/;
function decodeB64(s: string): Buffer | null {
  return STRICT_B64.test(s) ? Buffer.from(s, "base64") : null;
}

interface Parsed {
  m: number;
  t: number;
  p: number;
  salt: Buffer;
  tag: Buffer;
}

function parse(hash: string): Parsed | null {
  const parts = hash.split("$");
  if (parts.length !== 6 || parts[0] !== "" || parts[1] !== "argon2id" || parts[2] !== "v=19") {
    return null;
  }
  const params = /^m=(\d{1,7}),t=(\d{1,3}),p=(\d{1,3})$/.exec(parts[3] ?? "");
  const salt = decodeB64(parts[4] ?? "");
  const tag = decodeB64(parts[5] ?? "");
  if (!params || !salt || !tag) return null;
  const [m, t, p] = [Number(params[1]), Number(params[2]), Number(params[3])] as const;
  if (
    m < 8 * p ||
    m > MAX_MEMORY ||
    t < 1 ||
    t > MAX_PASSES ||
    p < 1 ||
    p > MAX_PARALLELISM ||
    salt.length < MIN_SALT ||
    salt.length > MAX_SALT ||
    tag.length < MIN_TAG ||
    tag.length > MAX_TAG
  ) {
    return null;
  }
  return { m, t, p, salt, tag };
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    const parsed = parse(hash);
    if (!parsed) return false;
    const actual = await argon2Async("argon2id", {
      message: plain,
      nonce: parsed.salt,
      memory: parsed.m,
      passes: parsed.t,
      parallelism: parsed.p,
      tagLength: parsed.tag.length,
    });
    return actual.length === parsed.tag.length && timingSafeEqual(actual, parsed.tag);
  } catch {
    return false;
  }
}

// Valid hash of a random value, so unknown-username logins pay the same KDF cost as real ones.
export const DUMMY_HASH: string = (() => {
  const salt = randomBytes(SALT_LENGTH);
  const tag = argon2Sync("argon2id", {
    message: randomBytes(32),
    nonce: salt,
    memory: MEMORY,
    passes: PASSES,
    parallelism: PARALLELISM,
    tagLength: TAG_LENGTH,
  });
  return encode(MEMORY, PASSES, PARALLELISM, salt, tag);
})();
