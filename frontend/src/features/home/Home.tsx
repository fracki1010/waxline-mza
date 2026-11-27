import { useRef, useState, type ComponentType } from "react";
import { OfflineBanner } from "../auth/OfflineBanner";
import { useSession, useSignOut } from "../auth/session";
import { DayView } from "../appointments/DayView";
import { useAppointments } from "../appointments/appointments";
import { todayLocal } from "../appointments/slots";
import { ServiceList } from "../services/ServiceList";
import { ProductList } from "../products/ProductList";
import { CustomerList } from "../customers/CustomerList";
import { SalesScreen } from "../sales/SalesScreen";
import { OutboxScreen } from "../queue/OutboxScreen";
import { SyncStatus } from "../queue/SyncStatus";
import { useOutbox } from "../../shared/useOutbox";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";

type View = "home" | "agenda" | "services" | "products" | "customers" | "sales" | "queue";

const SCREENS: Record<Exclude<View, "home">, ComponentType> = {
  agenda: DayView,
  services: ServiceList,
  products: ProductList,
  customers: CustomerList,
  sales: SalesScreen,
  queue: OutboxScreen,
};

// Today's active appointments; shows nothing until the agenda data is known.
function TodaySummary() {
  const today = useAppointments(todayLocal());
  if (!today.data) return null;
  const active = today.data.filter((a) => a.status === "active").length;
  return <p className="sync-status">{messages.todayCount(String(active))}</p>;
}

export function Home() {
  const { data } = useSession();
  const signOut = useSignOut();
  const heading = useScreenFocus();
  const busy = useRef(false); // same-tick guard: isPending only updates after a render
  const [view, setView] = useState<View>("home");
  const outboxEntries = useOutbox();
  const queued = outboxEntries.length;
  const refused = outboxEntries.some((e) => e.status === "rejected");

  if (view !== "home") {
    const Screen = SCREENS[view];
    return (
      <main className="screen">
        <OfflineBanner />
        <button type="button" className="back-link" onClick={() => setView("home")}>
          {messages.backHome}
        </button>
        <Screen />
      </main>
    );
  }

  return (
    <main className="screen">
      <h1 ref={heading} tabIndex={-1}>
        {messages.welcome(data?.displayName ?? "")}
      </h1>
      <OfflineBanner />
      <TodaySummary />
      <SyncStatus />
      <nav className="home-nav">
        <button type="button" onClick={() => setView("agenda")}>
          {messages.agendaButton}
        </button>
        <button type="button" onClick={() => setView("services")}>
          {messages.servicesButton}
        </button>
        <button type="button" onClick={() => setView("products")}>
          {messages.productsButton}
        </button>
        <button type="button" onClick={() => setView("customers")}>
          {messages.customersButton}
        </button>
        <button type="button" onClick={() => setView("sales")}>
          {messages.salesButton}
        </button>
        <button
          type="button"
          className={queued > 0 ? (refused ? "queue-refused" : "queue-waiting") : undefined}
          onClick={() => setView("queue")}
        >
          {queued > 0 ? `${messages.queueButton} (${queued})` : messages.queueButton}
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
