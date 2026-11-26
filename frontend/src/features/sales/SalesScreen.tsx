import { useState, type FormEvent } from "react";
import { ApiRefusal } from "../../shared/apiRefusal";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import { useCustomers } from "../customers/customers";
import { useProducts } from "../products/products";
import { useServices } from "../services/services";
import { todayLocal } from "../appointments/slots";
import { useCancelSale, useRecordSale, useSales, type Sale, type SaleInput } from "./sales";

type Line = { kind: "service" | "product"; refId: string; quantity: string };

const REFUSALS: Record<string, string> = {
  INSUFFICIENT_STOCK: messages.insufficientStockError,
  INACTIVE_PRODUCT: messages.inactiveProductError,
  INACTIVE_SERVICE: messages.inactiveServiceError,
  ALREADY_CANCELLED: messages.alreadyCancelledError,
  VALIDATION_ERROR: messages.validationError,
};

function refusalMessage(err: unknown): string {
  return (err instanceof ApiRefusal && REFUSALS[err.code]) || messages.genericError;
}

const money = (pesos: number) => `$${pesos.toLocaleString("es-AR")}`;

export function SalesScreen() {
  const heading = useScreenFocus();
  const [day, setDay] = useState(todayLocal());
  const [creating, setCreating] = useState(false);
  const sales = useSales(day);
  const customers = useCustomers("");
  const cancel = useCancelSale();
  const customerName = (id: string) => customers.data?.find((c) => c.id === id)?.name ?? "";

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.salesTitle}
      </h1>
      <label>
        {messages.dayLabel}
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <button type="button" className="day-new" onClick={() => setCreating(true)}>
        {messages.newSale}
      </button>
      {creating && <SaleForm onDone={() => setCreating(false)} />}
      {sales.isPending && <p role="status">{messages.loading}</p>}
      {sales.isError && <p role="alert">{messages.genericError}</p>}
      {sales.data?.length === 0 && <p>{messages.emptySales}</p>}
      {cancel.isError && <p role="alert">{refusalMessage(cancel.error)}</p>}
      <ul>
        {sales.data?.map((sale) => (
          <SaleRow
            key={sale.id}
            sale={sale}
            customer={customerName(sale.customerId)}
            onCancel={() => cancel.mutate(sale.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function SaleRow({
  sale,
  customer,
  onCancel,
}: {
  sale: Sale;
  customer: string;
  onCancel: () => void;
}) {
  const cancelled = sale.status === "cancelled";
  const time = new Date(sale.createdAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return (
    <li className={cancelled ? "appt appt-cancelled" : "appt"}>
      <span className="appt-time">
        {time} · {customer} · {money(sale.total)}
        {cancelled && <span> ({messages.saleCancelled})</span>}
      </span>
      <span className="appt-detail">
        {sale.lines.map((line) => `${line.name} × ${line.quantity}`).join(", ")}
      </span>
      {!cancelled && (
        <div className="appt-actions">
          <button
            type="button"
            aria-label={`${messages.cancelSale}: ${customer}, ${time}`}
            onClick={onCancel}
          >
            {messages.cancelSale}
          </button>
        </div>
      )}
    </li>
  );
}

function SaleForm({ onDone }: { onDone: () => void }) {
  const customers = useCustomers("");
  const services = useServices();
  const products = useProducts();
  const record = useRecordSale();
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ kind: "service", refId: "", quantity: "1" }]);
  const [error, setError] = useState<string | null>(null);

  const customer = customers.data?.find((c) => c.id === customerId);
  const items = (kind: "service" | "product") =>
    kind === "service"
      ? (services.data ?? [])
          .filter((s) => s.active && s.price !== null)
          .map((s) => ({ id: s.id, name: s.name, price: s.price ?? 0 }))
      : (products.data ?? [])
          .filter((p) => p.active)
          .map((p) => ({ id: p.id, name: p.name, price: p.price }));

  const priceOf = (line: Line) => items(line.kind).find((i) => i.id === line.refId)?.price ?? 0;
  const total = lines.reduce((sum, line) => sum + priceOf(line) * (Number(line.quantity) || 0), 0);

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!customerId) {
      setError(messages.pickCustomer);
      return;
    }
    const payload: SaleInput["lines"] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      if (!line.refId || !Number.isInteger(quantity) || quantity < 1) {
        setError(messages.validationError);
        return;
      }
      payload.push({ kind: line.kind, refId: line.refId, quantity });
    }
    if (payload.length === 0) {
      setError(messages.addOneLine);
      return;
    }
    record.mutate(
      { customerId, vehicleId, lines: payload },
      { onSuccess: onDone, onError: (err) => setError(refusalMessage(err)) },
    );
  }

  return (
    <form className="form" onSubmit={submit} aria-label={messages.newSale}>
      <fieldset>
        <legend>{messages.saleCustomerLabel}</legend>
        <label>
          {messages.saleCustomerLabel}
          <select
            aria-label={messages.saleCustomerLabel}
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setVehicleId("");
            }}
            required
          >
            <option value="">—</option>
            {customers.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {customer && (
          <label>
            {messages.saleVehicleLabel}
            <select
              aria-label={messages.saleVehicleLabel}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              required
            >
              <option value="">—</option>
              {customer.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {v.model}
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>
      <fieldset>
        <legend>{messages.saleTotal}</legend>
        {lines.map((line, index) => (
          <div key={index} className="sale-line">
            <label>
              {messages.lineKindLabel}
              <select
                aria-label={messages.lineKindLabel}
                value={line.kind}
                onChange={(e) =>
                  updateLine(index, { kind: e.target.value as Line["kind"], refId: "" })
                }
              >
                <option value="service">{messages.kindService}</option>
                <option value="product">{messages.kindProduct}</option>
              </select>
            </label>
            <label>
              {messages.lineItemLabel}
              <select
                aria-label={messages.lineItemLabel}
                value={line.refId}
                onChange={(e) => updateLine(index, { refId: e.target.value })}
                required
              >
                <option value="">—</option>
                {items(line.kind).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {money(item.price)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {messages.quantityLabel}
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
              />
            </label>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
              >
                {messages.removeLine}
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setLines((current) => [...current, { kind: "service", refId: "", quantity: "1" }])
          }
        >
          {messages.addLine}
        </button>
      </fieldset>
      <p>
        {messages.saleTotal}: <strong>{money(total)}</strong>
      </p>
      {error !== null && <p role="alert">{error}</p>}
      <div className="form-actions">
        <button type="submit" disabled={record.isPending}>
          {messages.recordSale}
        </button>
        <button type="button" onClick={onDone}>
          {messages.cancelForm}
        </button>
      </div>
    </form>
  );
}
