import { Router } from "express";

// Read-only list of staff members, used to pick an employee for an appointment.
export function createStaffListRouter(): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { staff } = req.app.locals.services;
    const members = await staff.list();
    res.json({
      staff: members.map((member) => ({ id: member.id, displayName: member.displayName })),
    });
  });

  return router;
}
