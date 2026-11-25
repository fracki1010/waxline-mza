import express, { type Express } from "express";
import type { Db } from "mongodb";

export interface AppDeps {
  db: Db;
  now: () => Date;
  allowedOrigins: string[];
}

declare module "express-serve-static-core" {
  interface Locals {
    deps: AppDeps;
  }
}

// Routes and services receive `db` and `now` from deps; never call `new Date()` directly.
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.locals.deps = deps;
  app.use(express.json());
  return app;
}
