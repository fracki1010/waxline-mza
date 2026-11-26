---
type: spec
title: Spec — Appointments
description: WHAT and WHY for staff-managed appointments — problem, goals, behaviour, acceptance criteria.
tags: [sdd, spec]
timestamp: 2026-11-26T00:00:00Z
topic: sdd
slug: appointments
branch: main
status: approved
---

# Spec — Appointments

> Slug: `appointments` · Status: approved by owner 2026-11-26, A1–A4 confirmed · Created: 2026-11-26
> Inherits: [constitution](../constitution.md) · Depends on: [staff-auth](staff-auth.md)

## Problem & why
The car wash books its jobs in a notebook or in people's heads. Two staff members can book the same bay or the same employee for overlapping jobs, and nobody sees the day at a glance. The app needs to hold the day's appointments so staff can book them without collisions.

## Goals
- Staff create an appointment for one customer, one vehicle, one service, one employee.
- The app refuses an appointment that overlaps another appointment of the same employee.
- Staff see the day's appointments in one list.

## Non-goals / out of scope
- Customer accounts or customer self-booking.
- Reminders or notifications to customers.
- Pricing, invoicing or payments.
- Stock tracking (a later feature).
- Recurring appointments.

## Users & context
Signed-in staff only (see [staff-auth](staff-auth.md)). Any signed-in staff member can do every action; there are no roles yet.

## The four ASDD questions
1. **What can the user do?** Create, edit, cancel and view the day's agenda.
2. **What result do they get?** A saved appointment that appears in the day's list, or a clear refusal explaining the overlap.
3. **What must it respect?** Overlap rule below; staff-auth sessions; constitution.
4. **How does it prove it?** Acceptance criteria below, each with a test or a manual check.

## Behaviour

### Appointment data
Each appointment holds:
- Customer: name and phone.
- Vehicle: plate and model.
- Service: one service from a fixed list maintained by staff (list content to be defined in the plan).
- Employee: one staff member.
- Start and end time.

### Time slots
- Fixed slots exist, one per hour from 09:00 to 18:00 (owner confirmed the example).
- Staff may also create a custom start and end time when no fixed slot fits.
- Both kinds are validated by the same overlap rule.

### Overlap rule
- The same employee cannot have two appointments whose times overlap.
- Different employees may have appointments at the same time.
- An appointment that ends exactly when another starts does not overlap it.

### Actions
- **Create:** staff pick a slot or enter a custom time, fill the data, save. Refused if it overlaps the same employee's appointment.
- **Edit:** staff change any field. The same overlap rule applies to the edited time and employee.
- **Cancel:** staff cancel an appointment. A cancelled appointment no longer blocks its time. Cancelled appointments are kept, not deleted. (Owner did not state this; recorded as an assumption, see below.)
- **View the day:** a list of the chosen day's appointments ordered by start time, showing time, employee, customer, vehicle and service.

## Acceptance criteria
- AC1: Staff can create an appointment in a fixed slot and see it in that day's list.
- AC2: Staff can create an appointment with a custom start and end time.
- AC3: Creating an appointment that overlaps the same employee's appointment is refused with a message saying why; nothing is saved.
- AC4: Two appointments with different employees at the same time are both saved.
- AC5: An appointment ending exactly when the same employee's next one starts is saved.
- AC6: Editing an appointment to overlap the same employee's other appointment is refused; the stored appointment is unchanged.
- AC7: Cancelling an appointment removes it from the blocked time, so another appointment can take that slot.
- AC8: The day's list shows only that day's appointments, ordered by start time.
- AC9: All appointment actions require a signed-in staff session; without one the API refuses with the standard error shape.

## Assumptions (confirmed by owner 2026-11-26)
- A1: Cancelled appointments are kept with a status, not deleted.
- A2: Custom times must still fall on the same day as the list they appear in.
- A3: The service list is maintained by staff in the app; its content is not part of this spec.
- A4: Times are in the car wash's local time zone.

## Open questions
- None blocking the plan.
