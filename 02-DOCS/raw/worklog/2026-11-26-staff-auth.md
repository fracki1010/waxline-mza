# Worklog — staff-auth, 2026-11-26

## What
Staff sign-in feature (first feature, ASDD lane) closed and deployed. Production: https://waxline-mza.web.app (Hosting) → Cloud Run `waxline-api` (us-central1) → MongoDB Atlas.

## Why
Owner needed staff accounts before any appointment, stock or data-entry feature.

## Files
- Backend: `backend/src/routes/auth.ts`, `backend/src/services/password-input.ts`, `backend/src/scripts/create-staff*.ts`, `backend/Dockerfile`, `backend/.dockerignore`.
- Frontend: `frontend/src/shared/api.ts`, `frontend/src/features/auth/*`, `frontend/public/sw.js`, `frontend/swInject.ts`.
- Deploy: `firebase.json`, `.firebaserc`, `deploy/deploy-api.sh`, `deploy/README.md`.
- SDD record: `02-DOCS/wiki/sdd/progress/staff-auth.md`, `02-DOCS/wiki/sdd/decisions.md`, `02-DOCS/wiki/sdd/verifications/staff-auth-2026-11-26.md`.

## Outcome
- Tests at close: backend 179, frontend 143; pre-commit hooks passed on the last commits.
- Production verified: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC9 (see verification record). AC5 and AC6 confirmed by the owner on an iPhone. AC8 confirmed by the owner as working ("ya hice la verificación y salió bien"); the method was not recorded in the chat.
- Owner decisions: Cloud Run min-instances 0; Hosting origin `https://waxline-mza.web.app`; Atlas network access 0.0.0.0/0 (accepted risk, plan risk 3).

## Incidents
- Secret Manager versions 2–5 were malformed; version 6 is valid and in use.
- A full Atlas URI was pasted into chat by the owner. It was not used or repeated; the owner rotated the DB password.
- Interactive CLI password prompts did not reach the terminal pane; the owner-side temp file method was used and removed with `shred`.
- Account `franco` was recreated after a password mismatch (owner-approved delete of one document).

## Next
- Later features (appointments, stock, data entry) are out of scope here.
- Optional: move Atlas network access from 0.0.0.0/0 to a fixed egress if one becomes available.
- Do not commit `.rsc.json` or `.firebase/`.
