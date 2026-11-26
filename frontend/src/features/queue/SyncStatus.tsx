import { messages } from "../../shared/messages";
import { useLastSynced } from "../../shared/syncStatus";
import { useOutbox } from "../../shared/useOutbox";

// Shows when the data was last confirmed with the server, and how many changes still wait to be sent.
export function SyncStatus() {
  const lastSynced = useLastSynced();
  const pending = useOutbox().filter((e) => e.status === "pending").length;
  const time = lastSynced
    ? lastSynced.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  return (
    <p className="sync-status">
      {time ? messages.lastUpdated(time) : messages.notUpdatedYet}
      {pending > 0 && <> · {messages.queueCount(String(pending))}</>}
    </p>
  );
}
