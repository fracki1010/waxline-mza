import { useSession, useSignOut } from "../auth/session";
import { messages } from "../../shared/messages";

export function Home() {
  const { data } = useSession();
  const signOut = useSignOut();
  return (
    <main className="screen">
      <h1>{messages.welcome(data?.displayName ?? "")}</h1>
      <button type="button" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
        {messages.signOutButton}
      </button>
    </main>
  );
}
