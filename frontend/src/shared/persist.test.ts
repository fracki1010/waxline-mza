import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
  del: async (key: string) => {
    memory.delete(key);
  },
}));

const { persister } = await import("./persist");

describe("persister", () => {
  beforeEach(() => memory.clear());

  it("restores what was persisted and forgets it on removeClient", async () => {
    const client = { timestamp: 1, buster: "1", clientState: { queries: [], mutations: [] } };
    await persister.persistClient(client as never);
    expect(await persister.restoreClient()).toEqual(client);
    await persister.removeClient();
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it("swallows storage failures so the app keeps working online", async () => {
    const failing = vi.spyOn(memory, "set").mockImplementation(() => {
      throw new Error("quota");
    });
    await expect(persister.persistClient({} as never)).resolves.toBeUndefined();
    failing.mockRestore();
  });
});
