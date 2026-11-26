import { useRef, useState } from "react";
import { OfflineBanner } from "../auth/OfflineBanner";
import { useSession, useSignOut } from "../auth/session";
import { DayView } from "../appointments/DayView";
import { ServiceList } from "../services/ServiceList";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";

type View = "home" | "agenda" | "services";

export function Home() {
  const { data } = useSession();
  const signOut = useSignOut();
  const heading = useScreenFocus();
  const busy = useRef(false); // same-tick guard: isPending only updates after a render
  const [view, setView] = useState<View>("home");

  if (view !== "home") {
    return (
      <main className="screen">
        <OfflineBanner />
        <button type="button" className="back-link" onClick={() => setView("home")}>
          {messages.backHome}
        </button>
        {view === "agenda" ? <DayView /> : <ServiceList />}
      </main>
    );
  }

  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {messages.welcome(data?.displayName ?? "")}
      </h1>
      <OfflineBanner />
      <nav className="home-nav">
        <button type="button" onClick={() => setView("agenda")}>
          {messages.agendaButton}
        </button>
        <button type="button" onClick={() => setView("services")}>
          {messages.servicesButton}
        </button>
      </nav>
      <button
        type="button"
        className="signout"
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
