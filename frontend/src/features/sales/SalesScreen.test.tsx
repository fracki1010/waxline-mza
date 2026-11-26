import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { SalesScreen } from "./SalesScreen";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const customers = [
  {
    id: "c1",
    name: "Ana Pérez",
    phone: "1155550000",
    vehicles: [{ id: "v1", plate: "AB123CD", model: "Gol" }],
  },
];
const services = [{ id: "s1", name: "Lavado completo", active: true, price: 5000 }];
const sales = [
  {
    id: "sale1",
    customerId: "c1",
    vehicleId: "v1",
    lines: [
      {
        kind: "service",
        refId: "s1",
        name: "Lavado completo",
        quantity: 1,
        unitPrice: 5000,
        lineTotal: 5000,
      },
    ],
    total: 5000,
    status: "active",
    createdAt: new Date().toISOString(),
  },
];

const calls: { path: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (path.startsWith("/api/sales?") && method === "GET") return json({ sales });
      if (path === "/api/sales" && method === "POST") {
        return json({ error: { code: "INSUFFICIENT_STOCK", message: "x" } }, 409);
      }
      if (path === "/api/customers") return json({ customers });
      if (path === "/api/services") return json({ services });
      if (path === "/api/products") return json({ products: [] });
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderScreen() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <SalesScreen />
    </QueryClientProvider>,
  );
}

describe("SalesScreen", () => {
  it("lists the day's sales with customer, total and lines", async () => {
    renderScreen();
    const row = (await screen.findByText(/Ana Pérez/)).closest("li") as HTMLElement;
    expect(row).toHaveTextContent("$5.000"); // es-AR thousands separator
    expect(row).toHaveTextContent("Lavado completo × 1");
  });

  it("shows the stock refusal message when the API rejects a sale", async () => {
    renderScreen();
    await screen.findByText(/Ana Pérez/);
    fireEvent.click(screen.getByRole("button", { name: "Nueva venta" }));
    // Options load asynchronously; selecting before they exist leaves the select empty.
    await screen.findByRole("option", { name: "Ana Pérez" });
    await screen.findByRole("option", { name: /Lavado completo/ });
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "c1" } });
    fireEvent.change(screen.getByLabelText("Vehículo"), { target: { value: "v1" } });
    fireEvent.change(screen.getByLabelText("Elemento"), { target: { value: "s1" } });
    fireEvent.click(screen.getByRole("button", { name: "Registrar venta" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "No hay stock suficiente para esa venta.",
      ),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        path: "/api/sales",
        method: "POST",
        body: expect.objectContaining({
          customerId: "c1",
          vehicleId: "v1",
          lines: [{ kind: "service", refId: "s1", quantity: 1 }],
        }),
      }),
    );
  });
});
