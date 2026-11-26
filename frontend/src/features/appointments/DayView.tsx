import { useState } from "react";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { useStaff } from "../services/services";
import { AppointmentForm } from "./AppointmentForm";
import { useAppointments, useCancelAppointment, type Appointment } from "./appointments";
import { dayRange, todayLocal } from "./slots";
import { useOutbox } from "../../shared/useOutbox";

// 24-hour clock, matching the time inputs and the fixed slot list.
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// Moves a YYYY-MM-DD day by whole days using local calendar arithmetic; keeps it unchanged if the input is cleared.
function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  date.setDate(date.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DayView() {
  const heading = useScreenFocus();
  const [day, setDay] = useState(todayLocal());
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const appointments = useAppointments(day);
  const staff = useStaff();
  const cancel = useCancelAppointment();
  // Appointments created offline on this day, shown until the server accepts them.
  const queued = useOutbox().filter((entry) => {
    if (entry.path !== "/api/appointments") return false;
    const { from, to } = dayRange(day);
    const at = new Date(String(entry.body.start)).getTime();
    return at >= from.getTime() && at < to.getTime();
  });
  const employeeName = (id: string) =>
    staff.data?.find((member) => member.id === id)?.displayName ?? "";

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.agendaTitle}
      </h1>
      <div className="day-nav">
        <label>
          {messages.dayLabel}
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button type="button" onClick={() => setDay(shiftDay(day, -1))}>
          {messages.previousDay}
        </button>
        <button type="button" onClick={() => setDay(shiftDay(day, 1))}>
          {messages.nextDay}
        </button>
      </div>
      <button type="button" className="day-new" onClick={() => setEditing("new")}>
        {messages.newAppointment}
      </button>
      {editing !== null && (
        <AppointmentForm
          key={editing === "new" ? "new" : editing.id}
          day={day}
          initial={editing === "new" ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      )}
      {appointments.isPending && <p role="status">{messages.loading}</p>}
      {appointments.isError && <p role="alert">{messages.genericError}</p>}
      {appointments.data?.length === 0 && <p>{messages.emptyDay}</p>}
      {cancel.isError && <p role="alert">{messages.genericError}</p>}
      <ul>
        {queued.map((entry) => (
          <li
            key={entry.clientId}
            className={entry.status === "rejected" ? "appt appt-rejected" : "appt appt-pending"}
          >
            <span className="appt-time">
              {time(String(entry.body.start))}–{time(String(entry.body.end))}
            </span>
            <span className="appt-detail">
              {entry.label}: {String(entry.body.customerName)} · {String(entry.body.plate)}{" "}
              {String(entry.body.model)}{" "}
              <span>
                ({entry.status === "rejected" ? messages.queueRejected : messages.queuePending})
              </span>
            </span>
          </li>
        ))}
        {appointments.data?.map((item) => (
          <li
            key={item.id}
            className={item.status === "cancelled" ? "appt appt-cancelled" : "appt"}
          >
            <span className="appt-time">
              {time(item.start)}–{time(item.end)}
            </span>
            <span className="appt-detail">
              {item.serviceName} · {employeeName(item.employeeId)} · {item.customerName} ·{" "}
              {item.plate} {item.model}
              {item.status === "cancelled" && <span> ({messages.cancelled})</span>}
            </span>
            {item.status === "active" && (
              <span className="appt-actions">
                <button
                  type="button"
                  aria-label={`${messages.editAppointment}: ${item.customerName}, ${time(item.start)}`}
                  onClick={() => setEditing(item)}
                >
                  {messages.editAppointment}
                </button>
                <button
                  type="button"
                  aria-label={`${messages.cancelAppointment}: ${item.customerName}, ${time(item.start)}`}
                  onClick={() => cancel.mutate(item.id)}
                >
                  {messages.cancelAppointment}
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
