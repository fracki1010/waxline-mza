import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { Home } from "./Home";

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
});
