import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./credentials";

// Real Chromium, so colour contrast is measured (jsdom cannot). Same rule set as the unit tests otherwise.
async function audit(page: Page, label: string) {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const violations = await page.evaluate(async () => {
    // @ts-expect-error axe is injected by the test
    const result = await window.axe.run(document, { resultTypes: ["violations", "incomplete"] });
    return [...result.violations, ...result.incomplete].map(
      (v: { id: string; impact: string; nodes: { html: string }[] }) => ({
        id: v.id,
        impact: v.impact,
        html: v.nodes.slice(0, 3).map((n) => n.html),
      }),
    );
  });
  console.log(label, JSON.stringify(violations, null, 2));
  return violations;
}

test("axe in a real browser on agenda, form and services", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Usuario").fill(E2E.username);
  await page.getByLabel("Contraseña").fill(E2E.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Agenda del día" }).click();
  await expect(page.getByText("Juan Pérez")).toBeVisible();
  const agenda = await audit(page, "agenda");

  await page.getByRole("button", { name: "Nueva cita" }).click();
  await expect(page.getByRole("form", { name: "Nueva cita" })).toBeVisible();
  const form = await audit(page, "form");

  await page.getByRole("button", { name: "Volver al inicio" }).click();
  await page.getByRole("button", { name: "Servicios" }).click();
  await expect(page.getByText("Lavado completo")).toBeVisible();
  const services = await audit(page, "services");

  expect([...agenda, ...form, ...services]).toEqual([]);
});
