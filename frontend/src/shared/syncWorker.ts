import { apiFetch, NetworkError, SessionLostError } from "./api";
import { refusalOf } from "./apiRefusal";
import { outbox, type OutboxEntry } from "./outbox";
import { markSynced } from "./syncStatus";

export type FlushResult = "done" | "offline" | "session-lost";
type EntryResult = "sent" | "refused" | "offline" | "session-lost";

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 60_000;
export const POLL_MS = 60_000;

// 2 s, 4 s, 8 s ... capped at 60 s.
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_CAP_MS);
}

let running: Promise<FlushResult> | null = null;

// Overlapping triggers (online event, focus, timer) share one run, so each entry is sent once.
export function flushOutbox(): Promise<FlushResult> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<FlushResult> {
  for (const entry of await outbox.list()) {
    if (entry.status !== "pending") continue;
    const result = await sendOne(entry);
    if (result === "offline" || result === "session-lost") return result;
  }
  return "done";
}

async function sendOne(entry: OutboxEntry): Promise<EntryResult> {
  let res: Response;
  try {
    res = await apiFetch(entry.path, {
      method: entry.method,
      body: JSON.stringify(entry.body),
    });
  } catch (error) {
    if (error instanceof SessionLostError) return "session-lost";
    if (error instanceof NetworkError) return "offline";
    throw error;
  }
  if (res.ok) {
    await outbox.remove(entry.clientId);
    return "sent";
  }
  if (res.status >= 500) return "offline";
  // A business refusal (for example a 409) is kept for the person to resolve, never retried blindly.
  const refusal = await refusalOf(res);
  await outbox.reject(entry.clientId, refusal.code, refusal.message);
  return "refused";
}

// Retries with backoff while the network is down, and resyncs on reconnect, focus and a slow timer.
// Returns the cleanup function.
export function startSyncWorker(onSynced: () => void = () => {}): () => void {
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const sync = async (): Promise<void> => {
    clearTimeout(timer);
    const result = await flushOutbox();
    if (result === "done") {
      attempt = 0;
      markSynced();
      onSynced();
      return;
    }
    if (result === "offline") {
      timer = setTimeout(sync, backoffDelay(attempt));
      attempt += 1;
    }
  };
  const onReconnect = () => {
    attempt = 0;
    void sync();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void sync();
  };

  window.addEventListener("online", onReconnect);
  document.addEventListener("visibilitychange", onVisible);
  const poll = setInterval(() => void sync(), POLL_MS);
  void sync();

  return () => {
    clearTimeout(timer);
    clearInterval(poll);
    window.removeEventListener("online", onReconnect);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
