import { createStore, get, set } from "idb-keyval";

// A write made while offline (or not yet sent). clientId is the idempotency key the API already honours.
export interface OutboxEntry {
  clientId: string;
  method: "POST" | "PATCH";
  path: string;
  body: Record<string, unknown>;
  label: string;
  createdAt: number;
  status: "pending" | "rejected";
  rejectionCode?: string;
  rejectionMessage?: string;
}

export type NewEntry = Omit<OutboxEntry, "status" | "createdAt">;

const store = createStore("waxline", "outbox");
const KEY = "entries";

// Listeners run after each stored change so screens can show pending and rejected entries live.
const listeners = new Set<() => void>();
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function changed(): void {
  listeners.forEach((listener) => listener());
}

// Every read-modify-write goes through one queue, so two writers cannot overwrite each other's change.
let chain: Promise<unknown> = Promise.resolve();
function locked<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}

async function load(): Promise<OutboxEntry[]> {
  return (await get<OutboxEntry[]>(KEY, store)) ?? [];
}

export function newClientId(): string {
  return crypto.randomUUID();
}

// Errors reach the caller: a write that could not be stored must not look queued.
export const outbox = {
  list: () => locked(load),

  enqueue: (entry: NewEntry) =>
    locked(async () => {
      const current = await load();
      await set(KEY, [...current, { ...entry, status: "pending", createdAt: Date.now() }], store);
      changed();
    }),

  remove: (clientId: string) =>
    locked(async () => {
      const current = await load();
      await set(
        KEY,
        current.filter((e) => e.clientId !== clientId),
        store,
      );
      changed();
    }),

  reject: (clientId: string, code: string, message: string) =>
    locked(async () => {
      const current = await load();
      await set(
        KEY,
        current.map((e) =>
          e.clientId === clientId
            ? { ...e, status: "rejected" as const, rejectionCode: code, rejectionMessage: message }
            : e,
        ),
        store,
      );
      changed();
    }),
};
