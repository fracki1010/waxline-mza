# Worklog — offline-sync and home, 2026-11-27

## What
Offline-sync plan (tasks 3–8) closed and deployed. Home gained a today summary, a queue tile with state, and a sign-out guard for the query cache. Production: https://waxline-mza.web.app (Hosting) → Cloud Run `waxline-api`.

## Why
Staff can keep working when the link drops, without losing or duplicating writes. Home needed to show what is booked today and what still waits to be sent.

## Files
- Offline write path: `frontend/src/shared/outbox.ts`, `offlineWrite.ts`, `syncWorker.ts`, `syncStatus.ts`, `useOutbox.ts`, `persist.ts`, `queryClient.ts`.
- Queue screen: `frontend/src/features/queue/*`.
- Home: `frontend/src/features/home/Home.tsx`, `Home.test.tsx`; styles in `frontend/src/index.css`.
- Sign-out guard: `frontend/src/shared/queryClient.ts` (`createQueryClient`).
- E2E: `frontend/e2e/offline.spec.ts`, `frontend/e2e/seed.mjs`.
- Backend test stability: `scripts/test-db.sh`, `backend/vitest.config.ts`, `backend/test/helpers.ts`.

## Outcome
- Commits on `main`: `66b1e39` (product list order), `9a3407a` (today summary, sign-out guard), `39a00b1` (queue tile state), `bfc8e08` (home queue button counts pending only).
- Pushed to `origin/main`: all commits through `d4f8486`. Hosting deployed from `main` after `d4f8486`; `bfc8e08` is in production.
- Tooling: `scripts/worklog.sh` drafts a checkpoint from git history (`9c3a3ae`).
- Home redesign, first pass (`d4f8486`): home areas as one divided list, agenda rows divided instead of cards, more neutral palette, wider column from 48rem. Added `PRODUCT.md`. No `DESIGN.md` yet; forms still use the old look.
- Tests at close: backend 235, frontend 187; Playwright 11/11 after re-seeding `waxline_e2e`.
- Production: owner ran the staff flow himself and reported it worked.
- Sign-out leftover: the open summary re-registered the agenda query after the cache purge, so it could be persisted after sign-out. Fixed by a guard that removes any non-session query added while signed out.

## Incidents
- Three sign-out tests failed on a stale agenda query; root cause confirmed by a temporary debug log, then reverted.
- A `git push` and a `firebase deploy` were blocked by the permission classifier once; approved by the owner and run on the next request.

## Next
- Write `DESIGN.md` and restyle the forms (appointment, sale, customer) to the new home direction.
- Check the redesign on a real phone.
- Clients and services lists do not show pending state yet.
- Appointment edit offline stays blocked until the client holds the revision.
- Real-phone check, dark theme, and `ALLOWED_ORIGINS` (owner TBD in `deploy/deploy-api.sh`) still open.
- Do not commit `.rsc.json`, `.atl/`, `.impeccable/`, `frontend/.impeccable/` or `.firebase/`.
