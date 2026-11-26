import { Router } from "express";
import { ObjectId } from "mongodb";
import { sendError } from "../middleware/errors.js";
import type { CustomerDoc, VehicleDoc } from "../models/customer.js";

const HEX24 = /^[0-9a-f]{24}$/i;
const MAX_TEXT = 100;
const MAX_SEARCH = 100;

function parseText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function vehicleJson(vehicle: VehicleDoc) {
  return { id: vehicle._id.toHexString(), plate: vehicle.plate, model: vehicle.model };
}

// Each customer comes back with its vehicles, so one search answers "who is this and what do they drive".
async function withVehicles(
  customers: CustomerDoc[],
  lookup: (ids: ObjectId[]) => Promise<VehicleDoc[]>,
) {
  const ids = customers.map((c) => c._id);
  const owned = ids.length > 0 ? await lookup(ids) : [];
  return customers.map((c) => ({
    id: c._id.toHexString(),
    name: c.name,
    phone: c.phone,
    vehicles: owned.filter((v) => v.customerId.equals(c._id)).map(vehicleJson),
  }));
}

export function createCustomersRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { customers } = req.app.locals.services;
    const term = typeof req.query.q === "string" ? req.query.q.trim().slice(0, MAX_SEARCH) : "";
    const found = term.length > 0 ? await customers.search(term) : await customers.list();
    const json = await withVehicles(found, (ids) => customers.vehiclesOf(ids));
    res.json({ customers: json });
  });

  router.post("/", async (req, res) => {
    const { customers } = req.app.locals.services;
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const name = parseText(raw.name, MAX_TEXT);
    const phone = parseText(raw.phone, MAX_TEXT);
    if (name === null || phone === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Name and phone are required.");
      return;
    }
    const doc = await customers.insert({ name, phone }, res.locals.staff.id, res.locals.now);
    res
      .status(201)
      .json({ id: doc._id.toHexString(), name: doc.name, phone: doc.phone, vehicles: [] });
  });

  router.post("/:id/vehicles", async (req, res) => {
    const { customers } = req.app.locals.services;
    if (!HEX24.test(req.params.id)) {
      sendError(res, 404, "NOT_FOUND", "Customer not found.");
      return;
    }
    const customerId = new ObjectId(req.params.id);
    const customer = await customers.findById(customerId);
    if (customer === null) {
      sendError(res, 404, "NOT_FOUND", "Customer not found.");
      return;
    }
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const plate = parseText(raw.plate, 20);
    const model = parseText(raw.model, MAX_TEXT);
    if (plate === null || model === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Plate and model are required.");
      return;
    }
    const vehicle = await customers.insertVehicle(
      customerId,
      { plate, model },
      res.locals.staff.id,
      res.locals.now,
    );
    res.status(201).json(vehicleJson(vehicle));
  });

  return router;
}
