import { useRef } from "react";
import { OfflineBanner } from "../auth/OfflineBanner";
import { useSession, useSignOut } from "../auth/session";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";

export function Home() {
  const { data } = useSession();
  const signOut = useSignOut();
  const heading = useScreenFocus();
  const busy = useRef(false); // same-tick guard: isPending only updates after a render
  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {messages.welcome(data?.displayName ?? "")}
      </h1>
      <OfflineBanner />
      <button
        type="button"
        aria-disabled={signOut.isPending}
        onClick={() => {
          if (busy.current || signOut.isPending) return;
          busy.current = true;
          signOut.mutate(undefined, { onSettled: () => (busy.current = false) });
        }}
      >
        {signOut.isPending ? messages.signingOut : messages.signOutButton}
      </button>
    </main>
  );
}
