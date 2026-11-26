# appointments — progress ledger

Stage: deployed to production 2026-11-26 (owner approved). Accessibility (axe) check on the new screens and a real-device check are not done.

## Deployed
- API: Cloud Run revision `waxline-api-00006-f6q`, 100% traffic. Unauthenticated calls to `/api/services`, `/api/staff` and `/api/appointments` return 401.
- Hosting: `https://waxline-mza.web.app`, bundle `index-UUU0C9QZ.js`.
- Commits: `f7c161d` (appointments), `a9a4e58` (services), `0149593` (staff list), `8869833` and `d751577` (frontend).

## Assumptions to confirm
- Fixed slots start at 09:00 through 17:00, one hour each. The spec example said "9 to 18"; confirm whether 18:00 is also a start.
- An edit may keep a deactivated service when only the time changes.
- The day is computed in the device's time zone; the API takes instants.
- The same-day rule (A2) is enforced in the form only.

## Not done
- axe check on the appointment and service screens.
- Real-device check of the agenda and forms.
- Independent review of the diff.

## Frontend redeploy — accessibility fixes
- Hosting redeployed 2026-11-26 with commit `ed0427f`; bundle `index-D3gRNI23.js` served. Backend unchanged (still `waxline-api-00006-f6q`).
- Accessibility check done with axe in jsdom; contrast, real browser and screen reader checks are still open.
