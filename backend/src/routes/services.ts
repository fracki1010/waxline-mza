import { Router } from "express";
import { ObjectId } from "mongodb";
import { sendError } from "../middleware/errors.js";
import type { ServiceDoc } from "../models/service.js";

const HEX24 = /^[0-9a-f]{24}$/i;
const MAX_NAME = 100;

function toJson(doc: ServiceDoc) {
  return { id: doc._id.toHexString(), name: doc.name, active: doc.active };
}

// Returns the trimmed name, or null when the input is missing, empty, too long or not text.
function parseName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

export function createServicesRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { serviceCatalog } = req.app.locals.services;
    const docs = await serviceCatalog.list();
    res.json({ services: docs.map(toJson) });
  });

  router.post("/", async (req, res) => {
    const { serviceCatalog } = req.app.locals.services;
    const name = parseName((req.body as { name?: unknown } | null)?.name);
    if (name === null) {
      sendError(res, 400, "VALIDATION_ERROR", "Service name is required.");
      return;
    }
    const doc = await serviceCatalog.insert(name, res.locals.staff.id, res.locals.now);
    res.status(201).json(toJson(doc));
  });

  router.patch("/:id", async (req, res) => {
    const { serviceCatalog } = req.app.locals.services;
    if (!HEX24.test(req.params.id)) {
      sendError(res, 404, "NOT_FOUND", "Service not found.");
      return;
    }
    const raw = (req.body ?? {}) as { name?: unknown; active?: unknown };
    const changes: { name?: string; active?: boolean } = {};
    if ("name" in raw) {
      const name = parseName(raw.name);
      if (name === null) {
        sendError(res, 400, "VALIDATION_ERROR", "Service name is required.");
        return;
      }
      changes.name = name;
    }
    if ("active" in raw) {
      if (typeof raw.active !== "boolean") {
        sendError(res, 400, "VALIDATION_ERROR", "Active must be true or false.");
        return;
      }
      changes.active = raw.active;
    }
    if (Object.keys(changes).length === 0) {
      sendError(res, 400, "VALIDATION_ERROR", "Send a name or an active flag.");
      return;
    }
    const doc = await serviceCatalog.update(
      new ObjectId(req.params.id),
      changes,
      res.locals.staff.id,
      res.locals.now,
    );
    if (doc === null) {
      sendError(res, 404, "NOT_FOUND", "Service not found.");
      return;
    }
    res.json(toJson(doc));
  });

  return router;
}
