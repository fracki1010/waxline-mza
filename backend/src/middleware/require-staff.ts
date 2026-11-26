import type { RequestHandler } from "express";
import { sendError } from "./errors.js";
import { clearSessionCookie, readSession, setSessionCookie } from "./session-cookie.js";

// Session -> staff record -> res.locals.staff. Re-sends the cookie only when the session was touched.
export const requireStaff: RequestHandler = async (req, res, next) => {
  const { sessions, staff } = req.app.locals.services;
  const { id, present } = readSession(req);
  const session = id === null ? null : await sessions.resolve(id, res.locals.now);
  // The account may have been removed while its session is still live.
  const member = session === null ? null : await staff.findById(session.staffId);
  if (id === null || session === null || member === null) {
    // Clear only a cookie that was actually sent, or a race could delete one just set.
    if (present) clearSessionCookie(res);
    sendError(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    return;
  }
  if (session.touched) setSessionCookie(res, id);
  res.locals.staff = member;
  next();
};
