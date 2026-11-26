import { Router, type Request } from "express";
import { ObjectId } from "mongodb";
import { sendError } from "../middleware/errors.js";
import type { AppointmentDoc, AppointmentFields } from "../models/appointment.js";

const HEX24 = /^[0-9a-f]{24}$/i;
const PHONE = /^[0-9+\-\s()]{6,30}$/;
const REQUIRED: (keyof AppointmentFields)[] = [
  "customerName",
  "customerPhone",
  "plate",
  "model",
  "serviceId",
  "employeeId",
  "start",
  "end",
];

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;

const isDate = (value: unknown): value is string =>
  typeof value === "string" && !Number.isNaN(new Date(value).getTime());

// Validates only the fields present in the body, so the same parser serves create and edit.
function parsePartial(body: unknown): Partial<AppointmentFields> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const out: Partial<AppointmentFields> = {};
  if ("customerName" in raw) {
    if (!isText(raw.customerName, 100)) return null;
    out.customerName = raw.customerName.trim();
  }
  if ("customerPhone" in raw) {
    if (typeof raw.customerPhone !== "string" || !PHONE.test(raw.customerPhone)) return null;
    out.customerPhone = raw.customerPhone.trim();
  }
  if ("plate" in raw) {
    if (!isText(raw.plate, 10)) return null;
    out.plate = raw.plate.trim().toUpperCase();
  }
  if ("model" in raw) {
    if (!isText(raw.model, 60)) return null;
    out.model = raw.model.trim();
  }
  if ("serviceId" in raw) {
    if (typeof raw.serviceId !== "string" || !HEX24.test(raw.serviceId)) return null;
    out.serviceId = new ObjectId(raw.serviceId);
  }
  if ("employeeId" in raw) {
    if (typeof raw.employeeId !== "string" || !HEX24.test(raw.employeeId)) return null;
    out.employeeId = new ObjectId(raw.employeeId);
  }
  if ("start" in raw) {
    if (!isDate(raw.start)) return null;
    out.start = new Date(raw.start);
  }
  if ("end" in raw) {
    if (!isDate(raw.end)) return null;
    out.end = new Date(raw.end);
  }
  return out;
}

function toJson(doc: AppointmentDoc, serviceName: string) {
  return {
    id: doc._id.toHexString(),
    customerName: doc.customerName,
    customerPhone: doc.customerPhone,
    plate: doc.plate,
    model: doc.model,
    serviceId: doc.serviceId.toHexString(),
    serviceName,
    employeeId: doc.employeeId.toHexString(),
    start: doc.start.toISOString(),
    end: doc.end.toISOString(),
    status: doc.status,
  };
}

export function createAppointmentsRouter(): Router {
  const router = Router();

  // Creates and edits share one rule: the same employee may not have overlapping active appointments.
  async function checkFields(
    fields: AppointmentFields,
    exceptId: ObjectId | undefined,
    checkService: boolean,
    req: Request,
  ): Promise<{ status: number; code: string; message: string } | null> {
    const { staff, appointments, serviceCatalog } = req.app.locals.services;
    if (fields.end.getTime() <= fields.start.getTime()) {
      return { status: 400, code: "VALIDATION_ERROR", message: "End must be after start." };
    }
    if ((await staff.findById(fields.employeeId.toHexString())) === null) {
      return { status: 400, code: "VALIDATION_ERROR", message: "Unknown employee." };
    }
    // Deactivated services stay on old appointments, so only a new choice of service is checked.
    if (checkService) {
      const service = await serviceCatalog.findById(fields.serviceId);
      if (service === null || !service.active) {
        return { status: 400, code: "VALIDATION_ERROR", message: "Unknown or inactive service." };
      }
    }
    if (await appointments.hasOverlap(fields.employeeId, fields.start, fields.end, exceptId)) {
      return {
        status: 409,
        code: "APPOINTMENT_OVERLAP",
        message: "This employee already has an appointment at that time.",
      };
    }
    return null;
  }

  // Service names are read at response time, so a rename shows on every existing appointment (AC11).
  async function nameOf(req: Request, docs: AppointmentDoc[]): Promise<Map<string, string>> {
    return req.app.locals.services.serviceCatalog.findNames(docs.map((doc) => doc.serviceId));
  }

  router.get("/", async (req, res) => {
    const { appointments } = req.app.locals.services;
    const { from, to } = req.query;
    if (!isDate(from) || !isDate(to)) {
      sendError(res, 400, "VALIDATION_ERROR", "Provide from and to as ISO dates.");
      return;
    }
    const docs = await appointments.listBetween(new Date(from), new Date(to));
    const names = await nameOf(req, docs);
    res.json({
      appointments: docs.map((doc) => toJson(doc, names.get(doc.serviceId.toHexString()) ?? "")),
    });
  });

  router.post("/", async (req, res) => {
    const { appointments } = req.app.locals.services;
    const parsed = parsePartial(req.body);
    if (parsed === null || REQUIRED.some((key) => parsed[key] === undefined)) {
      sendError(res, 400, "VALIDATION_ERROR", "All appointment fields are required.");
      return;
    }
    const fields = parsed as AppointmentFields;
    const refusal = await checkFields(fields, undefined, true, req);
    if (refusal !== null) {
      sendError(res, refusal.status, refusal.code, refusal.message);
      return;
    }
    const doc = await appointments.insert(fields, res.locals.staff.id, res.locals.now);
    const names = await nameOf(req, [doc]);
    res.status(201).json(toJson(doc, names.get(doc.serviceId.toHexString()) ?? ""));
  });

  router.patch("/:id", async (req, res) => {
    const { appointments } = req.app.locals.services;
    if (!HEX24.test(req.params.id)) {
      sendError(res, 404, "NOT_FOUND", "Appointment not found.");
      return;
    }
    const id = new ObjectId(req.params.id);
    const parsed = parsePartial(req.body);
    if (parsed === null || Object.keys(parsed).length === 0) {
      sendError(res, 400, "VALIDATION_ERROR", "Send at least one valid appointment field.");
      return;
    }
    const current = await appointments.findById(id);
    if (current === null || current.status === "cancelled") {
      sendError(res, 404, "NOT_FOUND", "Appointment not found.");
      return;
    }
    // Check the merged result, so changing only the time still validates against the stored employee.
    const merged: AppointmentFields = {
      customerName: current.customerName,
      customerPhone: current.customerPhone,
      plate: current.plate,
      model: current.model,
      serviceId: current.serviceId,
      employeeId: current.employeeId,
      start: current.start,
      end: current.end,
      ...parsed,
    };
    const serviceChanged =
      parsed.serviceId !== undefined && !parsed.serviceId.equals(current.serviceId);
    const refusal = await checkFields(merged, id, serviceChanged, req);
    if (refusal !== null) {
      sendError(res, refusal.status, refusal.code, refusal.message);
      return;
    }
    const doc = await appointments.update(id, merged, res.locals.staff.id, res.locals.now);
    if (doc === null) {
      sendError(res, 404, "NOT_FOUND", "Appointment not found.");
      return;
    }
    const names = await nameOf(req, [doc]);
    res.json(toJson(doc, names.get(doc.serviceId.toHexString()) ?? ""));
  });

  router.post("/:id/cancel", async (req, res) => {
    const { appointments } = req.app.locals.services;
    if (!HEX24.test(req.params.id)) {
      sendError(res, 404, "NOT_FOUND", "Appointment not found.");
      return;
    }
    const doc = await appointments.cancel(
      new ObjectId(req.params.id),
      res.locals.staff.id,
      res.locals.now,
    );
    if (doc === null) {
      sendError(res, 404, "NOT_FOUND", "Appointment not found.");
      return;
    }
    const names = await nameOf(req, [doc]);
    res.json(toJson(doc, names.get(doc.serviceId.toHexString()) ?? ""));
  });

  return router;
}
