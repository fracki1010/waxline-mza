import { useState } from "react";
import { messages } from "../../shared/messages";
import { flushOutbox } from "../../shared/syncWorker";
import { outbox } from "../../shared/outbox";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { useOutbox } from "../../shared/useOutbox";
import { summarize } from "./useQueue";

// Pending and refused changes made on this device. A refused change stays until staff resend or discard it.
export function OutboxScreen() {
  const heading = useScreenFocus();
  const entries = useOutbox();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      await flushOutbox();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.queueTitle}
      </h1>
      {entries.length === 0 && <p>{messages.queueEmpty}</p>}
      {entries.length > 0 && (
        <button type="button" onClick={retry} aria-disabled={busy}>
          {messages.queueRetry}
        </button>
      )}
      <ul className="queue-list">
        {entries.map((entry) => (
          <li
            key={entry.clientId}
            className={entry.status === "rejected" ? "queue-item queue-rejected" : "queue-item"}
          >
            <span className="queue-summary">{summarize(entry)}</span>
            <span className="queue-state">
              {entry.status === "rejected"
                ? `${messages.queueRejected}: ${entry.rejectionMessage || messages.queueRejectedFallback}`
                : messages.queuePending}
            </span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(messages.queueDiscardConfirm)) {
                  void outbox.remove(entry.clientId);
                }
              }}
            >
              {messages.queueDiscard}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
