---
type: verification
title: Verification — Staff sign-in (production)
slug: staff-auth
date: 2026-11-26
status: partial
---

# Verification — staff-auth, 2026-11-26

Environment: `https://waxline-mza.web.app` (Hosting) → Cloud Run `waxline-api` (us-central1) → MongoDB Atlas. Checked by the owner on a real iPhone and by curl against production.

| AC | Result | Evidence |
|---|---|---|
| AC1 correct credentials sign in | PASS | Owner signed in on the web (production); owner reports it works on the iPhone; name on home not written down |
| AC2 wrong password refused generically | PASS (partly) | Unknown user with wrong password → 401 `INVALID_CREDENTIALS`, same message as a wrong password for a known user (not separately tested with a known user in production) |
| AC3 unknown username same as wrong password | PASS | Same 401 and body shape (see AC2) |
| AC4 signed-out visitor sees only sign-in | PASS (partly) | `GET /api/auth/me` without session → 401; owner saw the sign-in screen before signing in |
| AC5 reopen within 14 days keeps session | PARTIAL | Owner reports it works on the iPhone; the close-and-reopen steps and timing were not recorded. Not yet checked after one hour or the next day |
| AC6 sign-out ends access on the device | NOT RUN | Owner to confirm on the phone: Salir returns to sign-in and the home screen is no longer reachable |
| AC7 five failures lock the username | PASS | Throwaway username, 5 × 401 then 429 `LOCKED` on attempts 6 and 7 |
| AC8 session unused more than 14 days asks again | NOT RUN | Needs a 14-day wait or a clock change; covered by integration tests only |
| AC9 error shape and HTTPS | PASS (partly) | Refusals use `{error:{code,message}}`; a request from a foreign origin → 403 `FORBIDDEN_ORIGIN`; served over HTTPS. Not checked against every error path in production |

Not run in production: `npm audit` on the backend (no new dependency this slice); the service worker install and offline launch on a real device; contrast and screen reader checks (see T019).

Open for the owner: finish AC5 (reopen after an hour and the next day) and AC6 on the phone; then record the outcome here.
