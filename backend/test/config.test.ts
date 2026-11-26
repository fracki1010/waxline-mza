import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const ok = {
  MONGODB_URI: "mongodb://127.0.0.1:27017/waxline",
  ALLOWED_ORIGINS: "http://localhost:5173",
};

describe("loadConfig", () => {
  it("reads a minimal environment with the default port", () => {
    expect(loadConfig(ok)).toEqual({
      mongoUri: "mongodb://127.0.0.1:27017/waxline",
      port: 8080,
      allowedOrigins: ["http://localhost:5173"],
    });
  });

  it("requires MONGODB_URI", () => {
    for (const MONGODB_URI of [undefined, "", "   "]) {
      expect(() => loadConfig({ ...ok, MONGODB_URI })).toThrow(/MONGODB_URI/);
    }
  });

  it("requires at least one allowed origin", () => {
    for (const ALLOWED_ORIGINS of [undefined, "", " ", ",", " , ,"]) {
      expect(() => loadConfig({ ...ok, ALLOWED_ORIGINS })).toThrow(/ALLOWED_ORIGINS/);
    }
  });

  it("trims entries and normalises them to bare origins", () => {
    const config = loadConfig({
      ...ok,
      ALLOWED_ORIGINS:
        " http://localhost:5173/ , https://App.Example/some/path?x=1,https://app.example:443 ",
    });
    expect(config.allowedOrigins).toEqual([
      "http://localhost:5173",
      "https://app.example",
      "https://app.example",
    ]);
  });

  it("ignores empty entries between valid ones", () => {
    const config = loadConfig({ ...ok, ALLOWED_ORIGINS: "http://a.example,, ,http://b.example," });
    expect(config.allowedOrigins).toEqual(["http://a.example", "http://b.example"]);
  });

  it("rejects invalid or non-http(s) origins", () => {
    for (const ALLOWED_ORIGINS of [
      "not a url",
      "localhost:5173",
      "ftp://x.example",
      "http://ok.example,nope",
    ]) {
      expect(() => loadConfig({ ...ok, ALLOWED_ORIGINS })).toThrow(/ALLOWED_ORIGINS/);
    }
  });

  it("accepts an integer port from 1 to 65535 and rejects anything else", () => {
    expect(loadConfig({ ...ok, PORT: "3000" }).port).toBe(3000);
    expect(loadConfig({ ...ok, PORT: "1" }).port).toBe(1);
    expect(loadConfig({ ...ok, PORT: "65535" }).port).toBe(65535);
    expect(loadConfig({ ...ok, PORT: "" }).port).toBe(8080);
    for (const PORT of ["0", "65536", "-1", "1.5", "abc", "80a"]) {
      expect(() => loadConfig({ ...ok, PORT })).toThrow(/PORT/);
    }
  });
});
