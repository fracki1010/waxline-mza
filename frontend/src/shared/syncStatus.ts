import { useSyncExternalStore } from "react";

// When the outbox last reached the server and came back empty or fully sent. Null until the first success.
let lastSynced: Date | null = null;
const listeners = new Set<() => void>();

export function markSynced(): void {
  lastSynced = new Date();
  listeners.forEach((listener) => listener());
}

export function useLastSynced(): Date | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => lastSynced,
  );
}
