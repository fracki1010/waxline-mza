import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

// UI-only flag (no server data), held per QueryClient but outside the query cache so purging
// the cache never touches it.
type Store = { value: boolean; listeners: Set<() => void> };
const stores = new WeakMap<QueryClient, Store>();

function storeOf(client: QueryClient): Store {
  let s = stores.get(client);
  if (!s) stores.set(client, (s = { value: false, listeners: new Set() }));
  return s;
}

export function setSignOutNotice(client: QueryClient, value: boolean): void {
  const s = storeOf(client);
  if (s.value === value) return;
  s.value = value;
  s.listeners.forEach((l) => l());
}

export const clearSignOutNotice = (client: QueryClient) => setSignOutNotice(client, false);

export function useSignOutNotice(): boolean {
  const s = storeOf(useQueryClient());
  return useSyncExternalStore(
    (l) => (s.listeners.add(l), () => void s.listeners.delete(l)),
    () => s.value,
  );
}
