import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
}));

const { outbox, newClientId } = await import("./outbox");
const { backoffDelay, flushOutbox } = await import("./syncWorker");

function entry(clientId: string, path = "/api/customers") {
  return {
    clientId,
    method: "POST" as const,
    path,
    body: { clientId, name: "Ana", phone: "1" },
    label: "Cliente",
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  memory.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("outbox", () => {
  it("keeps entries in the order they were queued", async () => {
    await outbox.enqueue(entry("a"));
    await outbox.enqueue(entry("b"));
    expect((await outbox.list()).map((e) => e.clientId)).toEqual(["a", "b"]);
  });

  it("generates a UUID client id", () => {
    expect(newClientId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("flushOutbox", () => {
  it("sends pending entries in order and removes each one the server accepted", async () => {
    await outbox.enqueue(entry("a"));
    await outbox.enqueue(entry("b"));
    fetchMock.mockResolvedValueOnce(json(201, { id: "1" })).mockResolvedValueOnce(json(200, {}));

    expect(await flushOutbox()).toBe("done");
    expect(fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).clientId)).toEqual(["a", "b"]);
    expect(await outbox.list()).toEqual([]);
  });

  it("keeps a business refusal as rejected and moves on to the next entry", async () => {
    await outbox.enqueue(entry("a"));
    await outbox.enqueue(entry("b"));
    fetchMock
      .mockResolvedValueOnce(
        json(409, { error: { code: "APPOINTMENT_OVERLAP", message: "Taken" } }),
      )
      .mockResolvedValueOnce(json(201, {}));

    expect(await flushOutbox()).toBe("done");
    const left = await outbox.list();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({
      clientId: "a",
      status: "rejected",
      rejectionCode: "APPOINTMENT_OVERLAP",
    });
  });

  it("stops on a network failure and leaves every entry queued", async () => {
    await outbox.enqueue(entry("a"));
    await outbox.enqueue(entry("b"));
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    expect(await flushOutbox()).toBe("offline");
    expect((await outbox.list()).map((e) => e.status)).toEqual(["pending", "pending"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 5xx as temporary and keeps the entry", async () => {
    await outbox.enqueue(entry("a"));
    fetchMock.mockResolvedValueOnce(json(500, {}));
    expect(await flushOutbox()).toBe("offline");
    expect(await outbox.list()).toHaveLength(1);
  });

  it("stops and reports session loss on 401, keeping the queue for after sign-in", async () => {
    await outbox.enqueue(entry("a"));
    fetchMock.mockResolvedValueOnce(json(401, {}));
    expect(await flushOutbox()).toBe("session-lost");
    expect(await outbox.list()).toHaveLength(1);
  });

  it("shares one run between overlapping calls, so each entry is sent once", async () => {
    await outbox.enqueue(entry("a"));
    fetchMock.mockResolvedValue(json(201, {}));
    const [first, second] = await Promise.all([flushOutbox(), flushOutbox()]);
    expect(first).toBe("done");
    expect(second).toBe("done");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("backoffDelay", () => {
  it("doubles from 2 s and stops at 60 s", () => {
    expect([0, 1, 2, 3, 4, 5].map(backoffDelay)).toEqual([2000, 4000, 8000, 16000, 32000, 60000]);
  });
});
