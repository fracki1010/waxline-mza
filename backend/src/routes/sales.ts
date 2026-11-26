import { Router } from "express";
import { ObjectId } from "mongodb";
import { sendError } from "../middleware/errors.js";
import type { SaleDoc, SaleLine } from "../models/sale.js";

const HEX24 = /^[0-9a-f]{24}$/i;
const MAX_LINES = 50;
const MAX_QUANTITY = 999;

function saleJson(doc: SaleDoc) {
  return {
    id: doc._id.toHexString(),
    customerId: doc.customerId.toHexString(),
    vehicleId: doc.vehicleId.toHexString(),
    appointmentId: doc.appointmentId?.toHexString() ?? null,
    lines: doc.lines.map((line) => ({
      kind: line.kind,
      refId: line.refId.toHexString(),
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    total: doc.total,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

function parseId(value: unknown): ObjectId | null {
  return typeof value === "string" && HEX24.test(value) ? new ObjectId(value) : null;
}

function parseQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_QUANTITY
    ? value
    : null;
}

export function createSalesRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { sales } = req.app.locals.services;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      sendError(res, 400, "VALIDATION_ERROR", "Send a from and a to date, with from before to.");
      return;
    }
    const docs = await sales.list(from, to);
    res.json({ sales: docs.map(saleJson) });
  });

  router.post("/", async (req, res) => {
    const services = req.app.locals.services;
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const customerId = parseId(raw.customerId);
    const vehicleId = parseId(raw.vehicleId);
    const appointmentId = raw.appointmentId === undefined ? undefined : parseId(raw.appointmentId);
    if (
      customerId === null ||
      vehicleId === null ||
      appointmentId === null ||
      !Array.isArray(raw.lines)
    ) {
      sendError(res, 400, "VALIDATION_ERROR", "Customer, vehicle and lines are required.");
      return;
    }
    if (raw.lines.length === 0 || raw.lines.length > MAX_LINES) {
      sendError(res, 400, "VALIDATION_ERROR", "A sale needs between 1 and 50 lines.");
      return;
    }

    const customer = await services.customers.findById(customerId);
    if (customer === null) {
      sendError(res, 404, "NOT_FOUND", "Customer not found.");
      return;
    }
    const owned = await services.customers.vehiclesOf([customerId]);
    if (!owned.some((v) => v._id.equals(vehicleId))) {
      sendError(res, 404, "NOT_FOUND", "Vehicle not found for this customer.");
      return;
    }

    // Validate every line before touching stock, so a bad line never leaves a half-made sale.
    const lines: SaleLine[] = [];
    for (const item of raw.lines as Record<string, unknown>[]) {
      const refId = parseId(item.refId);
      const quantity = parseQuantity(item.quantity);
      if (
        refId === null ||
        quantity === null ||
        (item.kind !== "service" && item.kind !== "product")
      ) {
        sendError(
          res,
          400,
          "VALIDATION_ERROR",
          "Each line needs a kind, an id and a quantity from 1 to 999.",
        );
        return;
      }
      if (item.kind === "service") {
        const service = await services.serviceCatalog.findById(refId);
        if (service === null) {
          sendError(res, 404, "NOT_FOUND", "Service not found.");
          return;
        }
        if (!service.active) {
          sendError(res, 409, "INACTIVE_SERVICE", "This service is no longer offered.");
          return;
        }
        if (service.price === undefined) {
          sendError(res, 400, "VALIDATION_ERROR", `${service.name} has no price yet.`);
          return;
        }
        lines.push({
          kind: "service",
          refId,
          name: service.name,
          quantity,
          unitPrice: service.price,
          lineTotal: service.price * quantity,
        });
      } else {
        const product = await services.products.findById(refId);
        if (product === null) {
          sendError(res, 404, "NOT_FOUND", "Product not found.");
          return;
        }
        if (!product.active) {
          sendError(res, 409, "INACTIVE_PRODUCT", "This product is no longer sold.");
          return;
        }
        lines.push({
          kind: "product",
          refId,
          name: product.name,
          quantity,
          unitPrice: product.price,
          lineTotal: product.price * quantity,
        });
      }
    }

    // Stock first: each product is taken with a conditional update. If one fails, the earlier ones are given back.
    const taken: SaleLine[] = [];
    const giveBack = async () => {
      for (const line of taken) {
        await services.products.adjust(
          line.refId,
          line.quantity,
          res.locals.staff.id,
          res.locals.now,
        );
      }
    };
    for (const line of lines.filter((l) => l.kind === "product")) {
      const result = await services.products.adjust(
        line.refId,
        -line.quantity,
        res.locals.staff.id,
        res.locals.now,
      );
      if (result.status !== "ok") {
        await giveBack();
        if (result.status === "not_found") {
          sendError(res, 404, "NOT_FOUND", "Product not found.");
        } else {
          sendError(res, 409, "INSUFFICIENT_STOCK", `Not enough stock of ${line.name}.`);
        }
        return;
      }
      taken.push(line);
    }

    try {
      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const doc = await services.sales.insert(
        {
          customerId,
          vehicleId,
          ...(appointmentId ? { appointmentId } : {}),
          lines,
          total,
        },
        res.locals.staff.id,
        res.locals.now,
      );
      res.status(201).json(saleJson(doc));
    } catch (error) {
      await giveBack();
      throw error;
    }
  });

  router.post("/:id/cancel", async (req, res) => {
    const services = req.app.locals.services;
    const id = parseId(req.params.id);
    if (id === null) {
      sendError(res, 404, "NOT_FOUND", "Sale not found.");
      return;
    }
    const result = await services.sales.cancel(id, res.locals.staff.id, res.locals.now);
    if (result.status === "not_found") {
      sendError(res, 404, "NOT_FOUND", "Sale not found.");
      return;
    }
    if (result.status === "already_cancelled") {
      sendError(res, 409, "ALREADY_CANCELLED", "This sale is already cancelled.");
      return;
    }
    for (const line of result.doc.lines.filter((l) => l.kind === "product")) {
      await services.products.adjust(
        line.refId,
        line.quantity,
        res.locals.staff.id,
        res.locals.now,
      );
    }
    res.json(saleJson(result.doc));
  });

  return router;
}
