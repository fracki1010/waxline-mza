---
type: plan
title: Plan — Appointments
description: Technical blueprint for staff-managed appointments, built on the approved spec.
tags: [sdd, plan]
timestamp: 2026-11-26T00:00:00Z
topic: sdd
slug: appointments
branch: main
status: drafted
---

# Plan — Appointments

> Slug: `appointments` · Status: drafted, awaiting owner review · Created: 2026-11-26
> Spec: [appointments](../specs/appointments.md) · Depends on: [staff-auth](../specs/staff-auth.md)

## Architecture (fits the existing layout)
- **Backend:** a new `appointments` collection in MongoDB, a model under `backend/src/models/`, a router under `backend/src/routes/` mounted behind `requireStaff` (the same guard staff-auth uses).
- **Overlap check:** one service function under `backend/src/services/` that takes the employee, start and end and returns whether an active (not cancelled) appointment of that employee overlaps. Create and edit both call it. Overlap is strict: an end equal to another start is not an overlap (AC5).
- **Consistency:** a compound index on `(employeeId, start)` plus the overlap check in the service. The index speeds the lookup; the check in code is the rule. A database-level guarantee for overlapping ranges is not used, to keep the first slice simple.
- **Frontend:** a day view under `frontend/src/features/appointments/`, reached from the home screen after sign-in. Uses the same `apiFetch` and TanStack Query pattern as the auth feature.
- **Errors:** the standard `{error:{code,message}}` shape. Overlap refusal uses its own code (for example `APPOINTMENT_OVERLAP`) so the UI can explain it.

## Data
- `appointments`: customer name, customer phone, vehicle plate, vehicle model, serviceId, employeeId, start (UTC instant), end (UTC instant), status (`active` or `cancelled`), createdBy, updatedBy, timestamps.
- Times are stored as UTC instants and shown in the car wash's local zone (A4).
- Fixed slots are a frontend list (09:00 to 18:00, hourly). A custom time is any start and end the staff member enters.

## Work order (for the task breakdown)
1. Model, indexes and the overlap service, with unit tests for the boundary cases (AC3, AC5).
2. Routes: create, edit, cancel, list by day. Edit and create both run the overlap check (AC3, AC6, AC7, AC8, AC9).
3. Day view and create/edit forms, fixed-slot picker and custom time (AC1, AC2, AC4).
4. Accessibility and offline behaviour checks on the new screens, following the staff-auth pattern.

## Open points (need owner decision before task breakdown)
- **Service list (A3):** the owner confirmed staff maintain the service list in the app, but the spec has no criteria for it. Options: (a) a small screen to add, rename and deactivate services, which is a new slice with its own acceptance criteria; (b) a fixed list in code for the first slice, changed by a developer. Decision needed.
- **Session expiry during edit:** the app already handles lost sessions for staff-auth; the appointment forms should reuse that behaviour. No separate decision expected.

## Risks
- Time zone mistakes (A4): covered by a test that creates an appointment near midnight in the local zone.
- Concurrent creates for the same employee: two staff booking at the same moment could both pass the check. Low volume makes this unlikely; the first slice accepts this risk and records it. A stronger guarantee can come later.
