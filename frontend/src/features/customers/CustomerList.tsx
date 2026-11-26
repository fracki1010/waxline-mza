import { useState, type FormEvent } from "react";
import { ApiRefusal } from "../../shared/apiRefusal";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { useAddCustomer, useAddVehicle, useCustomers, type Customer } from "./customers";

function refusalMessage(err: unknown): string {
  return err instanceof ApiRefusal && err.code === "VALIDATION_ERROR"
    ? messages.validationError
    : messages.genericError;
}

function VehicleForm({ customerId }: { customerId: string }) {
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useAddVehicle();

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(
      { customerId, plate, model },
      {
        onSuccess: () => {
          setPlate("");
          setModel("");
          setError(null);
        },
        onError: (err) => setError(refusalMessage(err)),
      },
    );
  }

  return (
    <form className="form" onSubmit={submit} aria-label={messages.addVehicle}>
      <label>
        {messages.plateLabel}
        <input value={plate} onChange={(e) => setPlate(e.target.value)} required />
      </label>
      <label>
        {messages.modelLabel}
        <input value={model} onChange={(e) => setModel(e.target.value)} required />
      </label>
      {error !== null && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={add.isPending}>
          {messages.addVehicle}
        </button>
      </div>
    </form>
  );
}

function CustomerRow({ customer }: { customer: Customer }) {
  const [adding, setAdding] = useState(false);
  return (
    <li className="appt">
      <span className="appt-time">{customer.name}</span>
      <span className="appt-detail">{customer.phone}</span>
      {customer.vehicles.length === 0 ? (
        <span className="appt-detail">{messages.vehiclesEmpty}</span>
      ) : (
        <ul className="vehicles">
          {customer.vehicles.map((vehicle) => (
            <li key={vehicle.id}>
              {vehicle.plate} · {vehicle.model}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <VehicleForm customerId={customer.id} />
      ) : (
        <div className="appt-actions">
          <button
            type="button"
            aria-label={`${messages.addVehicle}: ${customer.name}`}
            onClick={() => setAdding(true)}
          >
            {messages.addVehicle}
          </button>
        </div>
      )}
    </li>
  );
}

export function CustomerList() {
  const heading = useScreenFocus();
  const [term, setTerm] = useState("");
  const customers = useCustomers(term);
  const add = useAddCustomer();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    add.mutate(
      { name, phone },
      {
        onSuccess: () => {
          setName("");
          setPhone("");
          setError(null);
        },
        onError: (err) => setError(refusalMessage(err)),
      },
    );
  }

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.customersTitle}
      </h1>
      <label>
        {messages.customerSearchLabel}
        <input
          type="search"
          value={term}
          placeholder={messages.customerSearchHint}
          onChange={(e) => setTerm(e.target.value)}
        />
      </label>
      <form className="form" onSubmit={submit} aria-label={messages.addCustomer}>
        <label>
          {messages.customerNameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {messages.customerPhoneLabel}
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </label>
        {error !== null && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={add.isPending}>
            {messages.addCustomer}
          </button>
        </div>
      </form>
      {customers.isPending && <p role="status">{messages.loading}</p>}
      {customers.isError && <p role="alert">{messages.genericError}</p>}
      {customers.data?.length === 0 && <p>{messages.customersEmpty}</p>}
      <ul>
        {customers.data?.map((customer) => (
          <CustomerRow key={customer.id} customer={customer} />
        ))}
      </ul>
    </section>
  );
}
