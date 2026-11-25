import { argon2, argon2Sync, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../src/services/hash.js";

// node:crypto is a boundary we do not own: wrap argon2 in a spy that still runs the real KDF,
// so tests can prove whether a hash was rejected by the parser (KDF never started) or by the compare.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, argon2: vi.fn(actual.argon2) };
});

const PREFIX = "$argon2id$v=19$m=19456,t=2,p=1$";
const b64 = (b: Buffer) => b.toString("base64").replace(/=+$/, "");

// Builds a hash that WOULD verify for `password` if the parser accepted it.
function phc(
  password: string,
  o: { m?: number; t?: number; p?: number; salt?: number; tag?: number } = {},
): string {
  const { m = 64, t = 1, p = 1, salt = 16, tag = 32 } = o;
  const s = randomBytes(salt);
  const h = argon2Sync("argon2id", {
    message: password,
    nonce: s,
    memory: m,
    passes: t,
    parallelism: p,
    tagLength: tag,
  });
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(s)}$${b64(h)}`;
}

beforeEach(() => {
  vi.mocked(argon2).mockReset(); // also drops queued mockImplementationOnce, keeps the real KDF wrapper
});

describe("hashPassword", () => {
  it("returns a PHC argon2id string without the plaintext", async () => {
    const hash = await hashPassword("correct horse");
    expect(hash.startsWith(PREFIX)).toBe(true);
    expect(hash).not.toContain("correct horse");
  });

  it("differs per call for the same password (random salt)", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it.each(["", "ñandú ✓", "a\0b"])("round-trips the password %j", async (pw) => {
    expect(await verifyPassword(pw, await hashPassword(pw))).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("is true for the right password and false for a wrong one", async () => {
    const hash = await hashPassword("right");
    expect(await verifyPassword("right", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects hostile or malformed hashes in the parser, without running the KDF", async () => {
    const good = phc("pw");
    const hostile: Record<string, unknown> = {
      empty: "",
      garbage: "garbage",
      "non-string": 123,
      "wrong algorithm": good.replace("$argon2id$", "$argon2i$"),
      "wrong version": good.replace("v=19", "v=16"),
      truncated: good.split("$").slice(0, 5).join("$"),
      "extra part": `${good}$extra`,
      "junk before the first separator": `x${good}`,
      "non-base64 tag": good.replace(/\$[^$]+$/, "$!!!notbase64!!!"),
      "padded base64 tag": `${good}=`,
      "empty salt": good.replace(/\$[^$]*(\$[^$]*)$/, "$$$1"),
      "salt too short": good.replace(/\$[^$]*(\$[^$]*)$/, "$AAAA$1"),
      "salt too long": phc("pw", { salt: 65 }),
      "tag too short": phc("pw", { tag: 8 }),
      "tag too long": phc("pw", { tag: 65 }),
      "memory above the cap": phc("pw", { m: 65537 }),
      "passes above the cap": phc("pw", { m: 64, t: 11 }),
      "parallelism above the cap": phc("pw", { m: 64, p: 5 }),
      "memory below 8 per lane": good.replace("m=64,t=1,p=1", "m=7,t=1,p=1"),
      "zero passes": good.replace("m=64,t=1,p=1", "m=64,t=0,p=1"),
      "zero parallelism": good.replace("m=64,t=1,p=1", "m=64,t=1,p=0"),
      "too many digits": good.replace("m=64,t=1,p=1", "m=000000064,t=1,p=1"),
    };
    for (const [name, hash] of Object.entries(hostile)) {
      await expect(verifyPassword("pw", hash as string), name).resolves.toBe(false);
      expect(argon2, name).not.toHaveBeenCalled();
    }
    // Control: the same builder with sane parameters is accepted.
    expect(await verifyPassword("pw", good)).toBe(true);
    expect(argon2).toHaveBeenCalledTimes(1);
  });

  it.each([16, 32, 64])("honours stored parameters and a %i-byte tag", async (tag) => {
    const hash = phc("low-cost", { tag });
    expect(await verifyPassword("low-cost", hash)).toBe(true);
    expect(await verifyPassword("other", hash)).toBe(false);
  });

  it("returns false instead of throwing when the KDF itself fails", async () => {
    const hash = phc("pw");
    vi.mocked(argon2).mockImplementationOnce(((...args: unknown[]) => {
      (args[args.length - 1] as (e: Error) => void)(new Error("boom"));
    }) as never);
    await expect(verifyPassword("pw", hash)).resolves.toBe(false);
  });
});

describe("DUMMY_HASH", () => {
  it("is a PHC string with real-hash cost, a 16-byte salt and a 32-byte tag", () => {
    expect(DUMMY_HASH.startsWith(PREFIX)).toBe(true);
    const [salt, tag] = DUMMY_HASH.split("$").slice(4);
    expect(Buffer.from(salt ?? "", "base64")).toHaveLength(16);
    expect(Buffer.from(tag ?? "", "base64")).toHaveLength(32);
  });

  it("makes an unknown-user check run the same KDF as a real one, and never verifies", async () => {
    expect(await verifyPassword("anything", DUMMY_HASH)).toBe(false);
    expect(argon2).toHaveBeenCalledTimes(1);
    expect(argon2).toHaveBeenCalledWith(
      "argon2id",
      expect.objectContaining({ memory: 19456, passes: 2, parallelism: 1, tagLength: 32 }),
      expect.any(Function),
    );
  });
});
