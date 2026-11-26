import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { DayView } from "./DayView";
import { todayLocal } from "./slots";

const today = todayLocal();
const appointment = {
  id: "a1",
  customerName: "Juan Pérez",
  customerPhone: "+54 11 5555-1234",
  plate: "AB123CD",
  model: "Gol",
  serviceId: "s1",
  serviceName: "Lavado completo",
  employeeId: "e1",
  start: new Date(`${today}T10:00`).toISOString(),
  end: new Date(`${today}T11:00`).toISOString(),
  status: "active",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDayView() {
  const client = createQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <DayView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/appointments?")) return json({ appointments: [appointment] });
      if (path === "/api/staff") return json({ staff: [{ id: "e1", displayName: "Ana" }] });
      if (path === "/api/services") {
        return json({ services: [{ id: "s1", name: "Lavado completo", active: true }] });
      }
      if (path === "/api/appointments" && init?.method === "POST") {
        return json({ error: { code: "APPOINTMENT_OVERLAP", message: "x" } }, 409);
      }
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DayView", () => {
  it("lists the day's appointments with service, employee and vehicle", async () => {
    renderDayView();
    const item = await screen.findByText("Lavado completo", { exact: false });
    expect(item.closest("li")).toHaveTextContent("Ana");
    expect(item.closest("li")).toHaveTextContent("AB123CD");
  });

  it("shows the overlap refusal in Spanish when saving a clashing appointment", async () => {
    renderDayView();
    await screen.findByText("Lavado completo", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Nueva cita" }));
    const form = screen.getByRole("form", { name: "Nueva cita" });
    // The selects fill from their own queries; wait for the options before choosing them.
    await waitFor(() =>
      expect(within(form).getByRole("option", { name: "Lavado completo" })).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(within(form).getByRole("option", { name: "Ana" })).toBeInTheDocument(),
    );
    fireEvent.change(within(form).getByLabelText("Cliente"), { target: { value: "María" } });
    fireEvent.change(within(form).getByLabelText("Teléfono"), {
      target: { value: "+54 11 5555-9999" },
    });
    fireEvent.change(within(form).getByLabelText("Patente"), { target: { value: "xy999zz" } });
    fireEvent.change(within(form).getByLabelText("Modelo"), { target: { value: "Fiat" } });
    fireEvent.change(within(form).getByLabelText("Servicio"), { target: { value: "s1" } });
    fireEvent.change(within(form).getByLabelText("Empleado"), { target: { value: "e1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cita" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Ese empleado ya tiene una cita en ese horario.",
      ),
    );
  });
});
