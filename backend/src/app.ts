import express, { Router, type Express } from "express";
import type { Db } from "mongodb";
import { checkOrigin } from "./middleware/origin.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { requireStaff } from "./middleware/require-staff.js";
import { createAppointmentModel } from "./models/appointment.js";
import { createCustomerModel } from "./models/customer.js";
import { createSaleModel } from "./models/sale.js";
import { createProductModel } from "./models/product.js";
import { createServiceModel } from "./models/service.js";
import { createStaffModel } from "./models/staff.js";
import { createAppointmentsRouter } from "./routes/appointments.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCustomersRouter } from "./routes/customers.js";
import { createProductsRouter } from "./routes/products.js";
import { createSalesRouter } from "./routes/sales.js";
import { createServicesRouter } from "./routes/services.js";
import { createStaffListRouter } from "./routes/staff.js";
import { healthRouter } from "./routes/health.js";
import { createLockout } from "./services/lockout.js";
import { createSessions } from "./services/sessions.js";

export interface AppDeps {
  db: Db;
  now: () => Date;
  allowedOrigins: string[];
  // Routes added here sit behind `requireStaff`; every API route outside sign-in/out and health must.
  mountProtected?: (router: Router) => void;
}

export interface Services {
  lockout: ReturnType<typeof createLockout>;
  sessions: ReturnType<typeof createSessions>;
  staff: ReturnType<typeof createStaffModel>;
  appointments: ReturnType<typeof createAppointmentModel>;
  serviceCatalog: ReturnType<typeof createServiceModel>;
  products: ReturnType<typeof createProductModel>;
  customers: ReturnType<typeof createCustomerModel>;
  sales: ReturnType<typeof createSaleModel>;
}

declare module "express-serve-static-core" {
  interface Locals {
    deps: AppDeps;
    services: Services;
    now: Date;
    staff: { id: string; displayName: string };
  }
}

// Routes and services receive `db` and `now` from deps; never call `new Date()` directly.
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.locals.deps = deps;
  app.locals.services = {
    lockout: createLockout(deps.db),
    sessions: createSessions(deps.db),
    staff: createStaffModel(deps.db),
    appointments: createAppointmentModel(deps.db),
    serviceCatalog: createServiceModel(deps.db),
    products: createProductModel(deps.db),
    customers: createCustomerModel(deps.db),
    sales: createSaleModel(deps.db),
  };
  app.use((_req, res, next) => {
    // One clock reading per request, shared by every service call.
    res.locals.now = deps.now();
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(checkOrigin(deps.allowedOrigins));
  app.use(express.json({ limit: "10kb" }));

  const api = Router();
  api.use(healthRouter);
  api.use("/auth", createAuthRouter());
  const protectedRoutes = Router();
  protectedRoutes.use(requireStaff);
  protectedRoutes.use("/appointments", createAppointmentsRouter());
  protectedRoutes.use("/services", createServicesRouter());
  protectedRoutes.use("/staff", createStaffListRouter());
  protectedRoutes.use("/products", createProductsRouter());
  protectedRoutes.use("/customers", createCustomersRouter());
  protectedRoutes.use("/sales", createSalesRouter());
  deps.mountProtected?.(protectedRoutes);
  api.use(protectedRoutes);
  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
