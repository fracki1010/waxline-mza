import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./credentials";

// Each run uses its own names so reruns against the same test database never collide.
const run = Date.now().toString(36);
const product = `Cera ${run}`;
const customer = `Marta ${run}`;

async function audit(page: Page) {
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected by the test
    const result = await window.axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter((v: { impact: string | null }) => v.impact === "critical" || v.impact === "serious")
      .map((v: { id: string; nodes: { html: string }[] }) => ({
        id: v.id,
        html: v.nodes.slice(0, 3).map((n) => n.html),
      }));
  });
}

async function openFromHome(page: Page, button: string, heading: string) {
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
}

async function backHome(page: Page) {
  await page.getByRole("button", { name: "Volver al inicio" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Usuario").fill(E2E.username);
  await page.getByLabel("Contraseña").fill(E2E.password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
});

test("products: add with stock and adjust below zero is refused", async ({ page }) => {
  await openFromHome(page, "Productos", "Productos");
  const add = page.getByRole("form", { name: "Agregar producto" });
  await add.getByLabel("Nombre del producto").fill(product);
  await add.getByLabel("Unidad").fill("lata");
  await add.getByLabel("Precio (pesos)").fill("1500");
  await add.getByLabel("Cantidad en stock").fill("2");
  await add.getByRole("button", { name: "Agregar producto" }).click();

  const row = page.getByRole("listitem").filter({ hasText: product });
  await expect(row).toContainText("Cantidad en stock: 2");
  await row.getByLabel("Sumar o restar").fill("-5");
  await row.getByRole("button", { name: "Aplicar" }).click();
  await expect(row.getByRole("alert")).toContainText("No hay stock suficiente");
  await expect(row).toContainText("Cantidad en stock: 2");

  expect(await audit(page)).toEqual([]);
});

test("customers: add a customer and a vehicle", async ({ page }) => {
  await openFromHome(page, "Clientes", "Clientes");
  const add = page.getByRole("form", { name: "Agregar cliente" });
  await add.getByLabel("Cliente").fill(customer);
  await add.getByLabel("Teléfono").fill("+54 11 5555-0101");
  await add.getByRole("button", { name: "Agregar cliente" }).click();

  const row = page.getByRole("listitem").filter({ hasText: customer });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Agregar vehículo: ${customer}` }).click();
  await row.getByLabel("Patente").fill("MZ123AB");
  await row.getByLabel("Modelo").fill("Gol");
  await row.getByRole("button", { name: "Agregar vehículo" }).click();
  await expect(row).toContainText("MZ123AB · Gol");

  expect(await audit(page)).toEqual([]);
});

test("sales: refused without stock, recorded with stock, then cancelled restores it", async ({
  page,
}) => {
  // Depends on the two tests above having created the product and the customer.
  await openFromHome(page, "Ventas", "Ventas");
  await page.getByRole("button", { name: "Nueva venta" }).click();
  const form = page.getByRole("form", { name: "Nueva venta" });
  await expect(form.getByRole("option", { name: customer })).toBeAttached();
  await form.getByLabel("Cliente").selectOption({ label: customer });
  const vehicle = await form.getByRole("option", { name: /MZ123AB/ }).getAttribute("value");
  await form.getByLabel("Vehículo").selectOption(vehicle ?? "");
  await form.getByLabel("Tipo").selectOption("product");
  const option = form.getByRole("option", { name: new RegExp(product) });
  await expect(option).toBeAttached();
  const item = await option.getAttribute("value");
  await form.getByLabel("Elemento").selectOption(item ?? "");
  await form.getByLabel("Cantidad en stock").fill("3");
  await form.getByRole("button", { name: "Registrar venta" }).click();
  await expect(page.getByRole("alert")).toContainText("No hay stock suficiente");

  await form.getByLabel("Cantidad en stock").fill("2");
  await form.getByRole("button", { name: "Registrar venta" }).click();
  await expect(page.getByRole("form", { name: "Nueva venta" })).toHaveCount(0);
  const sale = page.getByRole("listitem").filter({ hasText: customer });
  await expect(sale).toContainText(product);

  expect(await audit(page)).toEqual([]);

  await sale.getByRole("button", { name: /^Anular venta/ }).click();
  await expect(sale).toContainText("Anulada");

  await backHome(page);
  await openFromHome(page, "Productos", "Productos");
  await expect(page.getByRole("listitem").filter({ hasText: product })).toContainText(
    "Cantidad en stock: 2",
  );
});
