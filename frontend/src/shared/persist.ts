import { createStore, del, get, set } from "idb-keyval";
import type { PersistedClient, Persister } from "@tanstack/query-persist-client-core";

// Bump when the cached shape changes; an older cache is then discarded instead of read.
export const CACHE_BUSTER = "1";
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

const store = createStore("waxline", "query-cache");
const KEY = "client";

// Reads and writes never throw into React Query: a broken store means no cache, not a broken app.
export const persister: Persister = {
  async persistClient(client: PersistedClient) {
    try {
      await set(KEY, client, store);
    } catch {
      /* storage full or blocked: the app keeps working online */
    }
  },
  async restoreClient() {
    try {
      return await get<PersistedClient>(KEY, store);
    } catch {
      return undefined;
    }
  },
  async removeClient() {
    try {
      await del(KEY, store);
    } catch {
      /* nothing to remove */
    }
  },
};

// Asks the browser to keep IndexedDB data under storage pressure (AC1). Refusal is not an error.
export function requestDurableStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* unsupported browser */
  }
}
