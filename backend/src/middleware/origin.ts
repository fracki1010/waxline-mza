import type { RequestHandler } from "express";
import { sendError } from "./errors.js";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// A missing Origin is allowed (non-browser clients); SameSite=Lax and JSON-only bodies still apply.
export const checkOrigin =
  (allowedOrigins: string[]): RequestHandler =>
  (req, res, next) => {
    const origin = req.headers.origin;
    if (
      STATE_CHANGING.has(req.method) &&
      origin !== undefined &&
      !allowedOrigins.includes(origin)
    ) {
      sendError(res, 403, "FORBIDDEN_ORIGIN", "Origin not allowed.");
      return;
    }
    next();
  };
