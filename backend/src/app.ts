import express, { Router, type Express } from "express";
import type { Db } from "mongodb";
import { checkOrigin } from "./middleware/origin.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { requireStaff } from "./middleware/require-staff.js";
import { createStaffModel } from "./models/staff.js";
import { createAuthRouter } from "./routes/auth.js";
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
  deps.mountProtected?.(protectedRoutes);
  api.use(protectedRoutes);
  app.use("/api", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
