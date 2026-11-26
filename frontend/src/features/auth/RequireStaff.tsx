import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { NetworkError } from "../../shared/api";
import { SESSION_KEY } from "../../shared/queryClient";
import { messages } from "../../shared/messages";
import { SignIn } from "./SignIn";
import { useSession } from "./session";

export function RequireStaff({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data, error, isPending, refetch } = useSession();
  // A page restored from the back/forward cache may show a session that ended meanwhile.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void client.invalidateQueries({ queryKey: SESSION_KEY });
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [client]);
  if (isPending) {
    return (
      <p role="status" className="screen">
        {messages.loading}
      </p>
    );
  }
  // A failed background refetch keeps the children: data is only missing on a failed first load.
  if (error && data === undefined) {
    return (
      <main className="screen">
        <p role="alert">
          {error instanceof NetworkError ? messages.offline : messages.genericError}
        </p>
        <button type="button" onClick={() => void refetch()}>
          {messages.retryButton}
        </button>
      </main>
    );
  }
  return data ? children : <SignIn />;
}
