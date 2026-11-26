import { useEffect, useState } from "react";
import { outbox, subscribeOutbox, type OutboxEntry } from "./outbox";

// The current outbox contents, refreshed on every change. Storage that cannot be read shows as empty.
export function useOutbox(): OutboxEntry[] {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => {
      outbox.list().then(
        (list) => alive && setEntries(list),
        () => alive && setEntries([]),
      );
    };
    load();
    const unsubscribe = subscribeOutbox(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return entries;
}
