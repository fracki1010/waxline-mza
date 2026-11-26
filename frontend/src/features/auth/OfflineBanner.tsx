import { useState, useSyncExternalStore } from "react";
import { NetworkError } from "../../shared/api";
import { messages } from "../../shared/messages";
import { useSession } from "./session";

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

// Non-blocking live region, always mounted so a text change is announced. It reports "offline"
// when the browser says so or the session request could not reach the server (not on a 500).
// After recovery it says so until the next state change; a new screen mounts a new banner.
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  const { error } = useSession();
  const offline = !online || error instanceof NetworkError;
  const [wasOffline, setWasOffline] = useState(offline);
  const [recovered, setRecovered] = useState(false);
  if (offline !== wasOffline) {
    setWasOffline(offline);
    setRecovered(!offline);
  }
  return (
    <p role="status" className="banner">
      {offline ? messages.offlineBanner : recovered ? messages.backOnline : ""}
    </p>
  );
}
