# appointments — progress ledger

Stage: deployed to production 2026-11-26 (owner approved). Accessibility (axe) check on the new screens and a real-device check are not done.

## Deployed
- API: Cloud Run revision `waxline-api-00006-f6q`, 100% traffic. Unauthenticated calls to `/api/services`, `/api/staff` and `/api/appointments` return 401.
- Hosting: `https://waxline-mza.web.app`, bundle `index-UUU0C9QZ.js`.
- Commits: `f7c161d` (appointments), `a9a4e58` (services), `0149593` (staff list), `8869833` and `d751577` (frontend).

## Assumptions to confirm
- Decided by owner: fixed slots start at 09:00 through 18:00, one hour each (18:00 added in the frontend `slots.ts`; not yet deployed).
- An edit may keep a deactivated service when only the time changes.
- The day is computed in the device's time zone; the API takes instants.
- The same-day rule (A2) is enforced in the form only.

## Not done
- axe check on the appointment and service screens.
- Real-device check of the agenda and forms.
- Independent review of the diff.

## Frontend redeploy — accessibility fixes
- Hosting redeployed 2026-11-26 with commit `ed0427f`; bundle `index-D3gRNI23.js` served. Backend unchanged (still `waxline-api-00006-f6q`).
- Accessibility: axe in jsdom (unit tests) and axe in real Chromium with a phone viewport (`frontend/e2e/a11y.spec.ts`) found no violations or incomplete results on agenda, form and services, contrast included.
- Still open: screen reader check and a real phone check (owner).

## Design pass — agenda and form
- Committed `f38f9ff` (`feat(ui): redesign agenda and appointment form layout`) and pushed to `origin/main`.
- Not deployed to Hosting yet; deploy needs owner approval.
- Verified: unit tests (156), lint, typecheck, build, Playwright E2E + axe on phone viewport (6/6). Visual look at screenshots not done.

## Frontend redeploy — design pass and 18:00 slot
- Hosting redeployed 2026-11-26 from commit `f3acd0e`; bundle `index-CBjus5h6.js` served. Backend unchanged (`waxline-api-00006-f6q`).
- Check after deploy: `https://waxline-mza.web.app/api/services` returns 401 without a session.
- Still open: owner real-phone check and screen reader check.

## Frontend redeploy — day controls and form fields
- Commit `fd457fd`; hosting bundle `index-BpA5N4As.js` served (backend unchanged).
- Date on its own row, previous and next day below it. Start and end inputs appear only for a custom slot.
- Checks: unit tests (156), lint, typecheck, Playwright E2E + axe on phone viewport (6/6), local phone-width review.
- Still open: owner real-phone check and screen reader check.
