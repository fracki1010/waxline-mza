import { useState, type FormEvent } from "react";
import { messages } from "../../shared/messages";
import { ApiRefusal } from "../../shared/apiRefusal";
import { useServices, useStaff } from "../services/services";
import { useSaveAppointment, type Appointment } from "./appointments";
import { FIXED_SLOT_STARTS, addOneHour, instantOn, rangeProblem } from "./slots";

const REFUSAL_MESSAGES: Record<string, string> = {
  APPOINTMENT_OVERLAP: messages.overlapError,
  VALIDATION_ERROR: messages.validationError,
  NOT_FOUND: messages.notFoundError,
};

interface Props {
  day: string;
  initial?: Appointment;
  onDone: () => void;
}

export function AppointmentForm({ day, initial, onDone }: Props) {
  const services = useServices();
  const staff = useStaff();
  const save = useSaveAppointment(initial?.id);

  const [customerName, setCustomerName] = useState(initial?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [serviceId, setServiceId] = useState(initial?.serviceId ?? "");
  const [employeeId, setEmployeeId] = useState(initial?.employeeId ?? "");
  const initialStart = initial ? new Date(initial.start) : undefined;
  const initialEnd = initial ? new Date(initial.end) : undefined;
  const toTime = (d: Date) => d.toTimeString().slice(0, 5);
  const startFixed = initialStart && FIXED_SLOT_STARTS.includes(toTime(initialStart));
  // A new appointment starts on the first fixed slot, so both time fields are filled before submit.
  const defaultStart = FIXED_SLOT_STARTS[0] ?? "09:00";
  const [slot, setSlot] = useState(
    initial ? (startFixed ? toTime(initialStart) : "") : defaultStart,
  );
  const [startTime, setStartTime] = useState(initialStart ? toTime(initialStart) : defaultStart);
  const [endTime, setEndTime] = useState(
    initialEnd ? toTime(initialEnd) : addOneHour(defaultStart),
  );
  const [error, setError] = useState<string | null>(null);

  // Editing keeps the current service even if it was deactivated since; new choices use active ones only.
  const selectableServices = (services.data ?? []).filter(
    (service) => service.active || service.id === initial?.serviceId,
  );

  function pickSlot(value: string) {
    setSlot(value);
    if (value !== "") {
      setStartTime(value);
      setEndTime(addOneHour(value));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!customerName || !customerPhone || !plate || !model || !serviceId || !employeeId) {
      setError(messages.requiredFields);
      return;
    }
    const start = instantOn(day, startTime);
    const end = instantOn(day, endTime);
    const problem = rangeProblem(day, start, end);
    if (problem !== null) {
      setError(
        problem === "END_BEFORE_START" ? messages.endBeforeStartError : messages.otherDayError,
      );
      return;
    }
    save.mutate(
      { customerName, customerPhone, plate, model, serviceId, employeeId, start, end },
      {
        onSuccess: onDone,
        onError: (err) => {
          const code = err instanceof ApiRefusal ? err.code : "";
          setError(REFUSAL_MESSAGES[code] ?? messages.genericError);
        },
      },
    );
  }

  return (
    <form
      className="form"
      onSubmit={submit}
      aria-label={initial ? messages.editAppointment : messages.newAppointment}
    >
      <fieldset>
        <legend>{messages.customerGroup}</legend>
        <label>
          {messages.customerNameLabel}
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />
        </label>
        <label>
          {messages.customerPhoneLabel}
          <input
            type="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            required
          />
        </label>
      </fieldset>
      <fieldset>
        <legend>{messages.vehicleGroup}</legend>
        <label>
          {messages.plateLabel}
          <input value={plate} onChange={(e) => setPlate(e.target.value)} required />
        </label>
        <label>
          {messages.modelLabel}
          <input value={model} onChange={(e) => setModel(e.target.value)} required />
        </label>
      </fieldset>
      <fieldset>
        <legend>{messages.serviceGroup}</legend>
        <label>
          {messages.serviceLabel}
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} required>
            <option value="">—</option>
            {selectableServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {messages.employeeLabel}
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
            <option value="">—</option>
            {staff.data?.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>{messages.scheduleGroup}</legend>
        <label>
          {messages.slotLabel}
          <select value={slot} onChange={(e) => pickSlot(e.target.value)}>
            {FIXED_SLOT_STARTS.map((time) => (
              <option key={time} value={time}>
                {time}
              </option>
            ))}
            <option value="">{messages.customSlot}</option>
          </select>
        </label>
        {/* Fixed slots already set start and end; the time fields are only for a custom slot. */}
        {slot === "" && (
          <>
            <label>
              {messages.startLabel}
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </label>
            <label>
              {messages.endLabel}
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </label>
          </>
        )}
      </fieldset>
      {error !== null && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={save.isPending}>
          {messages.saveAppointment}
        </button>
        <button type="button" onClick={onDone}>
          {messages.cancelForm}
        </button>
      </div>
    </form>
  );
}
