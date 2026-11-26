import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
}));

const { outbox } = await import("../../shared/outbox");
const { OutboxScreen } = await import("./OutboxScreen");

const base = { method: "POST" as const, path: "/api/customers", body: {}, label: "Cliente" };

beforeEach(() => memory.clear());
afterEach(() => vi.restoreAllMocks());

describe("OutboxScreen", () => {
  it("says so when nothing is waiting", async () => {
    render(<OutboxScreen />);
    expect(await screen.findByText("No hay cambios pendientes.")).toBeInTheDocument();
  });

  it("lists pending and refused changes, with the server's reason for a refusal", async () => {
    await act(async () => {
      await outbox.enqueue({ ...base, clientId: "a", body: { name: "Ana" } });
      await outbox.enqueue({ ...base, clientId: "b", body: { name: "Marta" } });
      await outbox.reject("b", "VALIDATION_ERROR", "Nombre inválido.");
    });
    render(<OutboxScreen />);
    expect(await screen.findByText("Cliente: Ana")).toBeInTheDocument();
    expect(screen.getByText("Pendiente de envío")).toBeInTheDocument();
    expect(screen.getByText("No aceptado: Nombre inválido.")).toBeInTheDocument();
  });

  it("discards a change only after confirmation", async () => {
    await act(async () => {
      await outbox.enqueue({ ...base, clientId: "a", body: { name: "Ana" } });
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<OutboxScreen />);
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(confirm).toHaveBeenCalled();
    expect(await outbox.list()).toHaveLength(1);

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    await waitFor(async () => expect(await outbox.list()).toHaveLength(0));
  });
});
