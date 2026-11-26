# 2026-11-26 — Appointments, services and design pass (worklog)

## Done
- Appointments spec, plan and tasks approved; backend (appointments, service catalog, staff list) and frontend (agenda, form, services screen) built and deployed.
- Accessibility fixes (names of row actions, cancel errors, 44px selects) and Playwright E2E on a phone viewport, with axe in real Chromium.
- Design pass: agenda with previous/next day and 24-hour times, grouped appointment form, token-based stylesheet. Committed as `f38f9ff` and pushed to `origin/main`. Not yet deployed to Hosting.

## Decisions taken with the owner
- Overlap rule per employee: strict, touching edges allowed.
- Services are never deleted; deactivated services stay on old appointments and are blocked for new ones.
- Time is stored as UTC instants; slots are fixed hours from 09:00.

## Open
- Last fixed slot: 17:00 or 18:00.
- Edit with a deactivated service when only the time changes: currently allowed.
- Same-day rule (A2): enforced in the form only; the API does not check it.
- Real-phone check of the agenda and screen reader check (owner).
