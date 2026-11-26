import { expect, test, type Page } from "@playwright/test";
import { E2E } from "./credentials";

// Each run uses its own names so reruns against the same test database never collide.
const run = Date.now().toString(36);
const product = `Cera offline ${run}`;
const customer = `Offline ${run}`;

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

// Reads the outbox straight from IndexedDB, so the check does not depend on what the screen shows.
async function outboxEntries(page: Page): Promise<{ clientId: string; status: string }[]> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("waxline-outbox");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction("outbox", "readonly").objectStore("outbox").get("entries");
          req.onsuccess = () => {
            db.close();
            resolve(req.result ?? []);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
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

test("offline: last agenda stays readable and a stock change is refused before any request", async ({
  page,
  context,
}) => {
  // Load the data while online, so it is in the cache.
  await openFromHome(page, "Agenda del día", "Agenda del día");
  await expect(page.getByText("Juan Pérez")).toBeVisible();
  await backHome(page);
  await openFromHome(page, "Productos", "Productos");
  const add = page.getByRole("form", { name: "Agregar producto" });
  await add.getByLabel("Nombre del producto").fill(product);
  await add.getByLabel("Unidad").fill("lata");
  await add.getByLabel("Precio (pesos)").fill("1500");
  await add.getByLabel("Cantidad en stock").fill("5");
  await add.getByRole("button", { name: "Agregar producto" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: product })).toBeVisible();

  await context.setOffline(true);
  const adjustments: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/adjust")) adjustments.push(r.url());
  });

  const row = page.getByRole("listitem").filter({ hasText: product });
  await row.getByLabel("Sumar o restar").fill("-1");
  await row.getByRole("button", { name: "Aplicar" }).click();
  await expect(row.getByRole("alert")).toContainText("Esta acción necesita conexión");
  expect(adjustments).toEqual([]);

  // The agenda opened earlier still shows its data while offline.
  await backHome(page);
  await openFromHome(page, "Agenda del día", "Agenda del día");
  await expect(page.getByText("Juan Pérez")).toBeVisible();
  await context.setOffline(false);
});

test("offline work is kept, survives a reload, and is sent once when the link returns", async ({
  page,
}) => {
  // Only the create is refused by the network; everything else works, so the reload below can run.
  await page.route("**/api/customers", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );

  await openFromHome(page, "Clientes", "Clientes");
  const form = page.getByRole("form", { name: "Agregar cliente" });
  await form.getByLabel("Cliente", { exact: true }).fill(customer);
  await form.getByLabel("Teléfono").fill("1177770000");
  await form.getByRole("button", { name: "Agregar cliente" }).click();

  // The create could not reach the server, so it is queued instead of lost.
  await expect.poll(async () => (await outboxEntries(page)).length).toBe(1);
  await expect(form).toBeVisible();

  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  // Still queued after the reload.
  const kept = await outboxEntries(page);
  expect(kept).toHaveLength(1);
  expect(kept[0].status).toBe("pending");

  // A reload lands on home, so the queue button already shows the waiting change.
  await expect(page.getByRole("button", { name: /Pendientes \(1\)/ })).toBeVisible();
  await openFromHome(page, /Pendientes/, "Cambios pendientes");
  await expect(page.getByText(`Cliente: ${customer}`)).toBeVisible();
  await expect(page.getByText("Pendiente de envío")).toBeVisible();
  expect(await audit(page)).toEqual([]);

  // The link returns: stop failing the create and signal "online" twice, as overlapping triggers can.
  await page.unroute("**/api/customers");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new Event("online"));
  });
  await expect.poll(async () => (await outboxEntries(page)).length).toBe(0);

  // Exactly one customer was created, however many triggers fired.
  const res = await page.request.get(`/api/customers?q=${encodeURIComponent(customer)}`);
  const found = (await res.json()) as { customers: { name: string }[] };
  expect(found.customers.filter((c) => c.name === customer)).toHaveLength(1);
});
