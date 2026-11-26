import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { ProductList } from "./ProductList";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const products = [
  { id: "p1", name: "Cera", unit: "lata", price: 1500, quantity: 3, active: true },
  { id: "p2", name: "Shampoo", unit: "litro", price: 800, quantity: 0, active: false },
];

const calls: { path: string; method: string; body?: string }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body as string | undefined });
      if (method === "GET") return json({ products });
      if (path === "/api/products" && method === "POST") {
        return json({ id: "p3" }, 201);
      }
      if (path === "/api/products/p1/adjust") {
        return json({ error: { code: "INSUFFICIENT_STOCK", message: "x" } }, 409);
      }
      if (path === "/api/products/p2" && method === "PATCH") return json({ id: "p2" });
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
      <ProductList />
    </QueryClientProvider>,
  );
}

describe("ProductList", () => {
  it("shows stock and marks inactive products", async () => {
    renderList();
    const inactive = (await screen.findByText("Shampoo")).closest("li") as HTMLElement;
    expect(inactive).toHaveTextContent("Inactivo");
    const active = screen.getByText("Cera").closest("li") as HTMLElement;
    expect(active).toHaveTextContent("Cantidad en stock: 3");
  });

  it("adds a product with its name, unit, price and stock", async () => {
    renderList();
    await screen.findByText("Cera");
    fireEvent.change(screen.getByLabelText("Nombre del producto"), {
      target: { value: "Cera líquida" },
    });
    fireEvent.change(screen.getByLabelText("Unidad"), { target: { value: "botella" } });
    fireEvent.change(screen.getByLabelText("Precio (pesos)"), { target: { value: "2000" } });
    fireEvent.change(screen.getByLabelText("Cantidad en stock"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar producto" }));
    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({ path: "/api/products", method: "POST" }),
      ),
    );
    const created = calls.find((c) => c.method === "POST");
    expect(JSON.parse(created?.body ?? "{}")).toEqual(
      expect.objectContaining({ name: "Cera líquida", unit: "botella", price: 2000, quantity: 5 }),
    );
  });

  it("shows the stock refusal when an adjustment would leave negative stock", async () => {
    renderList();
    const row = (await screen.findByText("Cera")).closest("li") as HTMLElement;
    fireEvent.change(within(row).getByLabelText("Sumar o restar"), { target: { value: "-5" } });
    fireEvent.click(within(row).getByRole("button", { name: "Aplicar" }));
    await waitFor(() =>
      expect(within(row).getByRole("alert")).toHaveTextContent(
        "No hay stock suficiente para esa venta.",
      ),
    );
  });

  it("reactivates an inactive product", async () => {
    renderList();
    const row = (await screen.findByText("Shampoo")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^Activar/ }));
    await waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          path: "/api/products/p2",
          method: "PATCH",
          body: '{"active":true}',
        }),
      ),
    );
  });
});
