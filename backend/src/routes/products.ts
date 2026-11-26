import { Router } from "express";
import { ObjectId } from "mongodb";
import { sendError } from "../middleware/errors.js";
import type { ProductDoc } from "../models/product.js";

const HEX24 = /^[0-9a-f]{24}$/i;
const MAX_NAME = 100;
const MAX_UNIT = 20;
const MAX_INT = 1_000_000_000;

function toJson(doc: ProductDoc) {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    unit: doc.unit,
    price: doc.price,
    quantity: doc.quantity,
    active: doc.active,
  };
}

function parseText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function parseWhole(value: unknown, min: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= MAX_INT ? value : null;
}

export function createProductsRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { products } = req.app.locals.services;
    const docs = await products.list();
    res.json({ products: docs.map(toJson) });
  });

  router.post("/", async (req, res) => {
    const { products } = req.app.locals.services;
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const name = parseText(raw.name, MAX_NAME);
    const unit = parseText(raw.unit, MAX_UNIT);
    const price = parseWhole(raw.price, 0);
    const quantity = raw.quantity === undefined ? 0 : parseWhole(raw.quantity, 0);
    if (name === null || unit === null || price === null || quantity === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Name, unit, price and quantity are required.");
      return;
    }
    const doc = await products.insert(
      { name, unit, price, quantity },
      res.locals.staff.id,
      res.locals.now,
    );
    res.status(201).json(toJson(doc));
  });

  router.patch("/:id", async (req, res) => {
    const { products } = req.app.locals.services;
    if (!HEX24.test(req.params.id)) {
      sendError(res, 404, "NOT_FOUND", "Product not found.");
      return;
    }
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const changes: { name?: string; unit?: string; price?: number; active?: boolean } = {};
    if ("name" in raw) {
      const name = parseText(raw.name, MAX_NAME);
      if (name === null) {
        sendError(res, 400, "VALIDATION_ERROR", "Product name is required.");
        return;
      }
      changes.name = name;
    }
    if ("unit" in raw) {
      const unit = parseText(raw.unit, MAX_UNIT);
      if (unit === null) {
        sendError(res, 400, "VALIDATION_ERROR", "Unit is required.");
        return;
      }
      changes.unit = unit;
    }
    if ("price" in raw) {
      const price = parseWhole(raw.price, 0);
      if (price === null) {
        sendError(res, 400, "VALIDATION_ERROR", "Price must be whole pesos.");
        return;
      }
      changes.price = price;
    }
    if ("active" in raw) {
      if (typeof raw.active !== "boolean") {
        sendError(res, 400, "VALIDATION_ERROR", "Active must be true or false.");
        return;
      }
      changes.active = raw.active;
    }
    if (Object.keys(changes).length === 0) {
      sendError(res, 400, "VALIDATION_ERROR", "Send a field to change.");
      return;
    }
    const doc = await products.update(
      new ObjectId(req.params.id),
      changes,
      res.locals.staff.id,
      res.locals.now,
    );
    if (doc === null) {
      sendError(res, 404, "NOT_FOUND", "Product not found.");
      return;
    }
    res.json(toJson(doc));
  });

  router.post("/:id/adjust", async (req, res) => {
    const { products } = req.app.locals.services;
    if (!HEX24.test(req.params.id)) {
      sendError(res, 404, "NOT_FOUND", "Product not found.");
      return;
    }
    const delta = (req.body as { delta?: unknown } | null)?.delta;
    if (
      typeof delta !== "number" ||
      !Number.isInteger(delta) ||
      delta === 0 ||
      Math.abs(delta) > MAX_INT
    ) {
      sendError(res, 400, "VALIDATION_ERROR", "Delta must be a whole, non-zero number.");
      return;
    }
    const result = await products.adjust(
      new ObjectId(req.params.id),
      delta,
      res.locals.staff.id,
      res.locals.now,
    );
    if (result.status === "not_found") {
      sendError(res, 404, "NOT_FOUND", "Product not found.");
      return;
    }
    if (result.status === "insufficient") {
      sendError(res, 409, "INSUFFICIENT_STOCK", "Not enough stock for this change.");
      return;
    }
    res.json(toJson(result.doc));
  });

  return router;
}
