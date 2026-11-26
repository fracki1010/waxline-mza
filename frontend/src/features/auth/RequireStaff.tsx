import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { NetworkError } from "../../shared/api";
import { SESSION_KEY } from "../../shared/queryClient";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { SignIn } from "./SignIn";
import { useSession } from "./session";

// A Retry puts the query back to pending, so this screen replaces the Retry button: focus moves
// to the heading instead of dropping to <body>. A fast cold start must not steal focus.
function Loading({ focus }: { focus: boolean }) {
  const heading = useScreenFocus(focus);
  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {messages.appName}
      </h1>
      <p role="status">{messages.loading}</p>
    </main>
  );
}

function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const heading = useScreenFocus();
  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {messages.appName}
      </h1>
      <p role="alert">{error instanceof NetworkError ? messages.offline : messages.genericError}</p>
      <button type="button" onClick={onRetry}>
        {messages.retryButton}
      </button>
    </main>
  );
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const { data, error, isPending, refetch } = useSession();
  const [retried, setRetried] = useState(false);
  // A page restored from the back/forward cache may show a session that ended meanwhile.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void client.invalidateQueries({ queryKey: SESSION_KEY });
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [client]);
  if (isPending) {
    return <Loading focus={retried} />;
  }
  // A failed background refetch keeps the children: data is only missing on a failed first load.
  if (error && data === undefined) {
    return (
      <LoadError
        error={error}
        onRetry={() => {
          setRetried(true);
          void refetch();
        }}
      />
    );
  }
  return data ? children : <SignIn />;
}
