import { useState } from "react";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { useStaff } from "../services/services";
import { AppointmentForm } from "./AppointmentForm";
import { useAppointments, useCancelAppointment, type Appointment } from "./appointments";
import { todayLocal } from "./slots";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

export function DayView() {
  const heading = useScreenFocus();
  const [day, setDay] = useState(todayLocal());
  const [editing, setEditing] = useState<Appointment | "new" | null>(null);
  const appointments = useAppointments(day);
  const staff = useStaff();
  const cancel = useCancelAppointment();
  const employeeName = (id: string) =>
    staff.data?.find((member) => member.id === id)?.displayName ?? "";

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.agendaTitle}
      </h1>
      <label>
        {messages.dayLabel}{" "}
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>{" "}
      <button type="button" onClick={() => setEditing("new")}>
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
      <ul>
        {appointments.data?.map((item) => (
          <li key={item.id}>
            <strong>
              {time(item.start)}–{time(item.end)}
            </strong>{" "}
            {item.serviceName} · {employeeName(item.employeeId)} · {item.customerName} ·{" "}
            {item.plate} {item.model}
            {item.status === "cancelled" && <span> ({messages.cancelled})</span>}
            {item.status === "active" && (
              <>
                {" "}
                <button type="button" onClick={() => setEditing(item)}>
                  {messages.editAppointment}
                </button>{" "}
                <button type="button" onClick={() => cancel.mutate(item.id)}>
                  {messages.cancelAppointment}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
