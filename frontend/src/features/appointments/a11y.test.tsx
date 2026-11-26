import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../shared/queryClient";
import { ServiceList } from "../services/ServiceList";
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let container: HTMLElement;

// jsdom cannot compute colour, so contrast is disabled here and needs a real browser.
async function expectNoViolations() {
  expect(document.querySelectorAll("h1")).toHaveLength(1);
  const { violations } = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
}

function mount(ui: React.ReactElement) {
  const rendered = render(
    <QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>,
  );
  container = rendered.container;
  return rendered;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/appointments?")) return json(200, { appointments: [appointment] });
      if (path === "/api/staff") return json(200, { staff: [{ id: "e1", displayName: "Ana" }] });
      if (path === "/api/services") {
        return json(200, { services: [{ id: "s1", name: "Lavado completo", active: true }] });
      }
      if (path === "/api/appointments" && init?.method === "POST") {
        return json(409, { error: { code: "APPOINTMENT_OVERLAP", message: "x" } });
      }
      return json(404, { error: { code: "NOT_FOUND", message: "x" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("accessibility of appointment and service screens", () => {
  it("agenda with an appointment has no violations", async () => {
    mount(<DayView />);
    await screen.findByText("Lavado completo", { exact: false });
    await expectNoViolations();
  });

  it("appointment form with an error message has no violations", async () => {
    mount(<DayView />);
    await screen.findByText("Lavado completo", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Nueva cita" }));
    const form = screen.getByRole("form", { name: "Nueva cita" });
    await waitFor(() =>
      expect(within(form).getByRole("option", { name: "Ana" })).toBeInTheDocument(),
    );
    fireEvent.change(within(form).getByLabelText("Cliente"), { target: { value: "María" } });
    fireEvent.change(within(form).getByLabelText("Teléfono"), {
      target: { value: "+54 11 5555-9999" },
    });
    fireEvent.change(within(form).getByLabelText("Patente"), { target: { value: "XY999ZZ" } });
    fireEvent.change(within(form).getByLabelText("Modelo"), { target: { value: "Fiat" } });
    fireEvent.change(within(form).getByLabelText("Servicio"), { target: { value: "s1" } });
    fireEvent.change(within(form).getByLabelText("Empleado"), { target: { value: "e1" } });
    fireEvent.click(within(form).getByRole("button", { name: "Guardar cita" }));
    await screen.findByRole("alert");
    await expectNoViolations();
  });

  it("service list has no violations", async () => {
    mount(<ServiceList />);
    await screen.findByText("Lavado completo");
    await expectNoViolations();
  });
});
