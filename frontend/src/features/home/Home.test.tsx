import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { Home } from "./Home";

const memory = new Map<string, unknown>();

vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => memory.get(key),
  set: async (key: string, value: unknown) => {
    memory.set(key, value);
  },
}));

const { outbox } = await import("../../shared/outbox");
const base = { method: "POST" as const, path: "/api/customers", label: "Cliente" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const appointment = (id: string, status: "active" | "cancelled") => ({
  id,
  customerName: "Cliente",
  customerPhone: "1155550000",
  plate: "AB123CD",
  model: "Gol",
  serviceId: "s1",
  serviceName: "Lavado",
  employeeId: "e1",
  start: new Date().toISOString(),
  end: new Date().toISOString(),
  status,
  revision: 1,
});

beforeEach(() => {
  memory.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === "/api/auth/me") return json({ id: "u1", displayName: "Franco" });
      if (path.startsWith("/api/appointments?")) {
        return json({
          appointments: [
            appointment("a1", "active"),
            appointment("a2", "active"),
            appointment("a3", "cancelled"),
          ],
        });
      }
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Home", () => {
  it("summarises today's active appointments, leaving out cancelled ones", async () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Home />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Hoy: 2 citas")).toBeInTheDocument();
  });

  it("tints the queue tile while changes wait, and in the error colour when one was refused", async () => {
    const tile = () => screen.getByRole("button", { name: /Pendientes/ });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <Home />
      </QueryClientProvider>,
    );
    expect(tile()).not.toHaveClass("queue-waiting", "queue-refused");

    await act(async () => {
      await outbox.enqueue({ ...base, clientId: "a", body: {} });
    });
    await waitFor(() => expect(tile()).toHaveClass("queue-waiting"));

    await act(async () => {
      await outbox.reject("a", "VALIDATION_ERROR", "Nombre inválido.");
    });
    await waitFor(() => expect(tile()).toHaveClass("queue-refused"));
    // The colour alone is not enough: the refusal must also be said in the text.
    expect(tile()).toHaveTextContent("revisar un cambio no aceptado");
  });
});
