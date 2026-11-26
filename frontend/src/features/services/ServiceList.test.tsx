import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { ServiceList } from "./ServiceList";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls: { path: string; method: string; body?: string }[] = [];
let services = [{ id: "s1", name: "Lavado completo", active: true }];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body as string | undefined });
      if (method === "GET") return json({ services });
      if (method === "POST") {
        services = [...services, { id: "s2", name: "Encerado", active: true }];
        return json({ id: "s2", name: "Encerado", active: true }, 201);
      }
      if (path === "/api/services/s1") {
        const body = JSON.parse(init?.body as string) as { active?: boolean };
        services = services.map((s) =>
          s.id === "s1" ? { ...s, active: body.active ?? s.active } : s,
        );
        return json({ id: "s1", name: "Lavado completo", active: body.active });
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
      <ServiceList />
    </QueryClientProvider>,
  );
}

describe("ServiceList", () => {
  it("adds a service by name", async () => {
    renderList();
    await screen.findByText("Lavado completo");
    fireEvent.change(screen.getByLabelText("Nombre del servicio"), {
      target: { value: "Encerado" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar servicio" }));
    await waitFor(() => expect(screen.getByText("Encerado")).toBeInTheDocument());
    expect(calls).toContainEqual(
      expect.objectContaining({
        path: "/api/services",
        method: "POST",
        body: '{"name":"Encerado"}',
      }),
    );
  });

  it("deactivates a service and shows it as inactive", async () => {
    renderList();
    const row = (await screen.findByText("Lavado completo")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^Desactivar/ }));
    await waitFor(() => expect(row).toHaveTextContent("Inactivo"));
    expect(calls).toContainEqual(
      expect.objectContaining({
        path: "/api/services/s1",
        method: "PATCH",
        body: '{"active":false}',
      }),
    );
  });
});
