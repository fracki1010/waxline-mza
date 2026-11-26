import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { App } from "./App";
import "./index.css";
import { createQueryClient } from "./shared/queryClient";
import { CACHE_BUSTER, CACHE_MAX_AGE, persister, requestDurableStorage } from "./shared/persist";

const queryClient = createQueryClient();
requestDurableStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster: CACHE_BUSTER }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Registration failure must never break the app.
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
