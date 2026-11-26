import type { ErrorRequestHandler, RequestHandler, Response } from "express";

export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export const notFound: RequestHandler = (_req, res) => {
  sendError(res, 404, "NOT_FOUND", "Resource not found.");
};

// Body-parser errors carry a 4xx `status`; anything else is a fault and must not leak details.
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = (err as { status?: unknown } | null)?.status;
  if (status === 413) {
    sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  } else if (typeof status === "number" && status >= 400 && status < 500) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid request.");
  } else {
    // Log the error class only: messages and stacks can carry hashes, URIs or input.
    console.error("Unhandled request error:", err instanceof Error ? err.name : typeof err);
    sendError(res, 500, "INTERNAL_ERROR", "Something went wrong.");
  }
};
