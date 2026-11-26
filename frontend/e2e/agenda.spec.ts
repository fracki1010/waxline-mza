import { expect, test } from "@playwright/test";
import { E2E } from "./credentials";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Usuario").fill(E2E.username);
  await page.getByLabel("Contraseña").fill(E2E.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Agenda del día" }).click();
  await expect(page.getByRole("heading", { name: "Agenda del día" })).toBeVisible();
});

test("agenda shows today's appointment and fits the phone width", async ({ page }) => {
  await expect(page.getByText("Juan Pérez")).toBeVisible();
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});

test("a clashing appointment is refused with the overlap message", async ({ page }) => {
  await page.getByRole("button", { name: "Nueva cita" }).click();
  const form = page.getByRole("form", { name: "Nueva cita" });
  await form.getByLabel("Cliente").fill("María");
  await form.getByLabel("Teléfono").fill("+54 11 5555-9999");
  await form.getByLabel("Patente").fill("XY999ZZ");
  await form.getByLabel("Modelo").fill("Fiat");
  await form.getByLabel("Servicio").selectOption({ label: "Lavado completo" });
  await form.getByLabel("Empleado").selectOption({ label: "Ana" });
  await form.getByLabel("Horario").selectOption("10:00");
  await form.getByRole("button", { name: "Guardar cita" }).click();
  await expect(page.getByRole("alert")).toContainText("Ese empleado ya tiene una cita");
});

test("a free appointment is saved, then cancelled and removed from the day", async ({ page }) => {
  await page.getByRole("button", { name: "Nueva cita" }).click();
  const form = page.getByRole("form", { name: "Nueva cita" });
  await form.getByLabel("Cliente").fill("Lucía");
  await form.getByLabel("Teléfono").fill("+54 11 5555-7777");
  await form.getByLabel("Patente").fill("LM456KL");
  await form.getByLabel("Modelo").fill("Peugeot 208");
  await form.getByLabel("Servicio").selectOption({ label: "Lavado completo" });
  await form.getByLabel("Empleado").selectOption({ label: "Ana" });
  await form.getByLabel("Horario").selectOption("15:00");
  await form.getByRole("button", { name: "Guardar cita" }).click();
  await expect(page.getByText("Lucía")).toBeVisible();

  await page.getByRole("button", { name: /^Cancelar cita: Lucía/ }).click();
  await expect(page.getByText("Lucía")).toHaveCount(0);
});

test("signed-in staff can go back home and sign out", async ({ page }) => {
  await page.getByRole("button", { name: "Volver al inicio" }).click();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page.getByLabel("Usuario")).toBeVisible();
});

// Last on purpose: it moves Juan Pérez's seeded appointment, which the overlap test relies on.
test("an existing appointment can be edited to another time", async ({ page }) => {
  await page.getByRole("button", { name: /^Editar: Juan Pérez/ }).click();
  const form = page.getByRole("form", { name: "Editar" });
  await form.getByLabel("Horario").selectOption("12:00");
  await form.getByRole("button", { name: "Guardar cita" }).click();
  await expect(page.getByRole("form", { name: "Editar" })).toHaveCount(0);
  await expect(page.getByText("12:00")).toBeVisible();
});
