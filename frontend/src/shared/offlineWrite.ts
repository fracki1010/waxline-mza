import { ApiRefusal } from "./apiRefusal";
import { NetworkError } from "./api";
import { messages } from "./messages";
import { outbox, type NewEntry } from "./outbox";

// Refused before any request is made: the change would be unsafe to replay later (stock, prices, status).
export const OFFLINE_BLOCKED = "OFFLINE_BLOCKED";

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function requireOnline(): void {
  if (isOffline()) throw new ApiRefusal(OFFLINE_BLOCKED, messages.offlineBlocked);
}

// Sends a replayable write, or keeps it in the outbox when the browser is offline or the server cannot
// be reached. The clientId goes into the body, so a replay after a lost response is answered, not repeated.
// Resolves to null when the write was queued.
export async function sendQueueable<T>(
  clientId: string,
  entry: Omit<NewEntry, "clientId">,
  send: () => Promise<T>,
): Promise<T | null> {
  const queue = async (): Promise<null> => {
    await outbox.enqueue({ ...entry, clientId });
    return null;
  };
  if (isOffline()) return queue();
  try {
    return await send();
  } catch (error) {
    if (error instanceof NetworkError) return queue();
    throw error;
  }
}
