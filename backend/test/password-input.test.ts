import { describe, expect, it } from "vitest";
import { normalizePassword } from "../src/services/password-input.js";

describe("normalizePassword", () => {
  it("returns plain ASCII unchanged", () => {
    expect(normalizePassword("correct horse")).toBe("correct horse");
  });

  it("maps canonically equivalent forms to the same string", () => {
    const nfc = "café";
    const nfd = "café";
    expect(nfc).not.toBe(nfd);
    expect(normalizePassword(nfd)).toBe(normalizePassword(nfc));
  });

  it("applies NFKC, not only NFC (compatibility characters fold)", () => {
    expect(normalizePassword("ﬁ")).toBe("fi");
    expect(normalizePassword("Ａ")).toBe("A");
  });

  it("accepts exactly 1024 characters and refuses 1025", () => {
    expect(normalizePassword("a".repeat(1024))).toBe("a".repeat(1024));
    expect(normalizePassword("a".repeat(1025))).toBeNull();
  });

  it("refuses lone surrogates but accepts valid pairs", () => {
    expect(normalizePassword("ab\ud800")).toBeNull();
    expect(normalizePassword("\udc00ab")).toBeNull();
    expect(normalizePassword("pass\u{1f600}")).toBe("pass\u{1f600}");
  });

  it("refuses non-string input", () => {
    for (const bad of [42, null, undefined, {}, ["a"], { $ne: null }]) {
      expect(normalizePassword(bad as never)).toBeNull();
    }
  });

  it("accepts the empty string (the route decides what to do with it)", () => {
    expect(normalizePassword("")).toBe("");
  });
});
