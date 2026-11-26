import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { CustomerList } from "./CustomerList";

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
  { id: "c2", name: "Luis Gómez", phone: "1166660000", vehicles: [] },
];

const calls: { path: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (path.startsWith("/api/customers?") || path === "/api/customers") {
        if (method === "GET") return json({ customers });
        return json({ id: "c3" }, 201);
      }
      if (path === "/api/customers/c1/vehicles" && method === "POST") {
        return json({ id: "v2" }, 201);
      }
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderList() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <CustomerList />
    </QueryClientProvider>,
  );
}

describe("CustomerList", () => {
  it("lists customers with their vehicles, or a note when they have none", async () => {
    renderList();
    const withCar = (await screen.findByText("Ana Pérez")).closest("li") as HTMLElement;
    expect(withCar).toHaveTextContent("AB123CD · Gol");
    const noCar = screen.getByText("Luis Gómez").closest("li") as HTMLElement;
    expect(noCar).toHaveTextContent("Sin vehículos cargados.");
  });

  it("searches by the typed term", async () => {
    renderList();
    await screen.findByText("Ana Pérez");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar cliente" }), {
      target: { value: "ana" },
    });
    await waitFor(() =>
      expect(calls).toContainEqual(expect.objectContaining({ path: "/api/customers?q=ana" })),
    );
  });

  it("adds a customer with name and phone", async () => {
    renderList();
    await screen.findByText("Ana Pérez");
    fireEvent.change(screen.getByLabelText("Cliente"), { target: { value: "Marta" } });
    fireEvent.change(screen.getByLabelText("Teléfono"), { target: { value: "1177770000" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar cliente" }));
    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          path: "/api/customers",
          method: "POST",
          body: expect.objectContaining({ name: "Marta", phone: "1177770000" }),
        }),
      ),
    );
  });

  it("adds a vehicle to a customer from the row's form", async () => {
    renderList();
    const row = (await screen.findByText("Ana Pérez")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Agregar vehículo: Ana Pérez" }));
    fireEvent.change(within(row).getByLabelText("Patente"), { target: { value: "AD456EF" } });
    fireEvent.change(within(row).getByLabelText("Modelo"), { target: { value: "Clio" } });
    fireEvent.click(within(row).getByRole("button", { name: "Agregar vehículo" }));
    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          path: "/api/customers/c1/vehicles",
          method: "POST",
          body: expect.objectContaining({ plate: "AD456EF", model: "Clio" }),
        }),
      ),
    );
  });
});
