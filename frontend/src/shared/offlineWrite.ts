import { ApiRefusal } from "./apiRefusal";
import { messages } from "./messages";
import { newClientId, outbox, type NewEntry } from "./outbox";

// Refused before any request is made: the change would be unsafe to replay later (stock, prices, status).
export const OFFLINE_BLOCKED = "OFFLINE_BLOCKED";

export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function requireOnline(): void {
  if (isOffline()) throw new ApiRefusal(OFFLINE_BLOCKED, messages.offlineBlocked);
}

// Stores the write for later when offline and reports true; online it reports false and the caller sends.
export async function queueWhenOffline(entry: Omit<NewEntry, "clientId">): Promise<boolean> {
  return queueWithId(newClientId(), entry);
}

// Same as queueWhenOffline, but the caller already put this clientId in the body it will send online.
export async function queueWithId(
  clientId: string,
  entry: Omit<NewEntry, "clientId">,
): Promise<boolean> {
  if (!isOffline()) return false;
  await outbox.enqueue({ ...entry, clientId });
  return true;
}
