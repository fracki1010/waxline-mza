# SDD decisions (append-only)

## 2026-11-24 — Stack and deployment
- Options: React+Vite+Supabase (proposed), Next.js+Supabase, MERN. Chosen by the human: MERN with Vite, TypeScript, TanStack Query, Zustand.
- Why: human preference. Backend runs on the human's own server, frontend on Firebase Hosting (two deployables, cross-origin, so CORS and HTTPS are required).

## 2026-11-24 — Scope order
- Staff only creates appointments for now; customer self-booking is later.
- Login for staff is a separate, earlier feature (`staff-auth`) so appointments are born protected. Appointments follow as a later feature.

## 2026-11-24 — Workflow
- Commits go straight to `main`; execution mode is automatic (ASDD autopilot).

## 2026-11-24 — Constitution v1.0.0 (provisional)
- Autopilot assumptions taken: npm as package manager, Vitest as test runner, 70% coverage floor, monorepo `backend/` + `frontend/`, Conventional Commits without emoji, argon2/bcrypt hashing. Listed as `review-after` in `progress/staff-auth.md`.

## 2026-11-24 — Spec staff-auth drafted
- Scope: sign in, stay signed in, sign out, lockout. Out: roles, account screens, reset, 2FA.
- Objection recorded, not blocking: managed sign-in (Firebase Authentication) would avoid storing passwords; kept own accounts per the owner's MERN choice (constitution 16).

## 2026-11-24 — Plan staff-auth
- Sessions: server-side in MongoDB, opaque id in an HttpOnly Secure SameSite=Lax cookie. Chosen over stateless tokens so sign-out and revocation are real.
- Deployment: front end and API under one registrable domain (Option A) so the cookie is first-party. Option B (different domains, token in page storage) only as a recorded exception.
- Passwords: argon2id.
- Isolation: straight on main, no worktree (owner's workflow decision; no other session in this folder).

## 2026-11-24 — Domain confirmed
- The owner has a domain, so deployment Option A (same registrable domain) is viable. Spike S0 (iPhone check) still pending.

## 2026-11-24 — Deployment moved to Firebase (constitution v1.1.0)
- Options: own server + Firebase front (two origins), Cloud Run + Atlas behind Hosting, Firestore + Firebase Auth. Chosen by the owner: Cloud Run + Atlas, keep MERN.
- Why: one origin makes the session cookie first-party and removes CORS and domain setup. Verified in Firebase docs: Hosting forwards only the `__session` cookie to Cloud Run and Cloud Run rewrites need a billing account (Blaze).
- Consequence: the `204.168.212.79` server is no longer used for this app; spike S0 is now task 0 on a real iPhone.

## 2026-11-24 — Delivery
- Owner chose one work-unit commit per slice directly on main for staff-auth (no size exception, no PRs). Tier-2 slices still need the owner's approval before they count as done.

## 2026-11-25 — Backend test database is Docker mongo:7, not an in-memory binary  (feature: staff-auth, task: T002)
Context   — the plan asked for an in-memory MongoDB; no local mongod exists and downloading a binary was not approved.
Options    — mongodb-memory-server (downloads a mongod binary), Docker container from the already-pulled `mongo:7`, a mocked driver.
Decision   — a real MongoDB in Docker on 127.0.0.1:27018 (`scripts/test-db.sh up|down`), started by the backend `pretest` script.
Why        — real index and TTL behaviour with no download. Cost: tests and the pre-commit hook need Docker running.

## 2026-11-25 — Git hooks live in .githooks  (feature: staff-auth, task: T002)
Decision   — `core.hooksPath` is `.githooks` (repo-local, not shared by `git clone`); `.githooks/pre-commit` runs lint, typecheck and tests in both packages. rsc had installed no git hooks, so nothing is bypassed.

## 2026-11-25 — Secrets ignore rules appended to the root .gitignore  (feature: staff-auth, task: T002)
Decision   — `.env`, `.env.*` (except `.env.example`), `node_modules/`, `dist/`, `coverage/` appended below a "not managed by rsc" comment. `rsc repair` may rewrite that file; re-check it after any repair.

## 2026-11-25 — Lockout store shape and shared username key  (feature: staff-auth, task: T005-T006)
Context   — the plan gave `isLocked/recordFailure/clear` without saying how they reach the database, and the lockout and the staff lookup both need the same normalised username.
Options    — module-level functions with a global db, a factory taking `db`, a class.
Decision   — `createLockout(db)` returns the three functions; `ensureLockoutIndexes(db)` creates the TTL index; `normaliseUsername` lives in `services/username.ts` and is reused by T018.
Why        — explicit dependency like `createApp`, testable with `startTestDb`, and one definition of the key. The dead duplicate-key retry was removed: MongoDB retries `_id`-equality upserts itself (checked on mongo:7).

## 2026-11-25 — Invalid clock fails closed in every time-dependent service  (feature: staff-auth, task: T007-T008)
Context   — a NaN `now` is stored by the Mongo driver as 1970, which made every session resolve as valid and a lockout never lock. The lockout review had called it a nit; the sessions review showed it is a fail-open.
Decision   — `assertValidNow` in `services/clock.ts` throws `TypeError`; called by `sessions.create/resolve` and `lockout.isLocked/recordFailure`. `create` also rejects a `staffId` that is not a non-empty string.
Why        — fix the bug class, not the line. Routes must treat a thrown TypeError as a 500 that denies access, never as "allow".

## 2026-11-25 — Reserve the sign-in attempt before verifying it  (feature: staff-auth, task: T009-T010)
Context   — the first route counted a failure after the argon2 check; the security review measured 8 guesses per window instead of 5 with waves of 4 concurrent requests, which breaks AC7.
Decision   — `lockout.reserve(username, now)` increments atomically and says whether the attempt may proceed; success calls `clear`. `isLocked` and `recordFailure` were removed. The server also refuses to start without `MONGODB_URI` and `ALLOWED_ORIGINS`, and `TRUST_PROXY` was dropped.
Why        — the check must be the write, otherwise concurrency defeats the limit. Fail loudly at startup instead of serving 403 on every browser POST.
Accepted   — anonymous traffic can fill the cap of 4 verifications (plan risk 13); unauthenticated unknown `/api/**` paths answer 401, not 404, so the route list is not revealed.

## 2026-11-25 — First account is created by a TTY-only CLI with a 10-character minimum  (feature: staff-auth, task: T011)
Context   — the spec has no account screens; the owner creates the first account outside the app, and the password must never reach argv, environment, logs, a pipe or shell history.
Decision   — `npm --prefix backend run create-staff -- <username> <displayName>` (built then run from `dist/`): the password is typed twice on a muted TTY prompt (one readline, no history; Ctrl-C and Ctrl-D end with "Cancelled", exit 1); non-TTY stdin is refused. `createFirstStaff` normalises with `normalizePassword`, rejects fewer than 10 UTF-16 units after NFKC, then ensures indexes, hashes and inserts. Only fixed messages are printed; every other error prints a generic line because driver errors can embed the connection string. Exit 0 on success, 1 on any failure.
Why        — the length floor of 10 is a product assumption (no strength policy beyond it); normalising through the same helper keeps the account signable on every device.
Accepted   — the CLI file is excluded from coverage; its prompt was checked by hand in a real pty (success, mismatch, Ctrl-C, Ctrl-D, secret never in output), not by the suite. The npm script rebuilds the backend first and needs `tsc`: T015 must decide whether the image ships `dist` and a way to run it, or the owner runs the script from a checkout.

## 2026-11-25 — Hand-written service worker with a build-injected precache and an /api bypass  (feature: staff-auth, task: T012)
Context   — constitution 20 needs an installable PWA that fails clearly offline; staff share phones, so the worker must never keep authenticated content.
Decision   — `frontend/public/sw.js` ignores every `/api/**` request (case-insensitive, any method), every non-GET and every cross-origin request, so the network and the server's `no-store` decide. Navigations are network-first with the cached `/` as fallback and are never stored; only content-hashed `/assets/*` files are cache-first, stored only when the response is ok, basic and not HTML (Hosting's SPA fallback could answer a removed hash with HTML). A Vite plugin (`frontend/swInject.ts`, on `writeBundle`) injects the cache name (hash of the asset names) and the precache list (`/`, manifest, icons, every built asset) so the shell loads offline and each deploy ships a new worker; old caches are deleted on activate. No dependency added. `apiFetch(path, init?, options?)` accepts only `/api/` paths (no `..`, no backslash), sends `cache: "no-store"`, maps 401 to `SessionLostError` unless `expectSessionLoss: false`, and maps a failed request to `NetworkError`.
Why        — a plugin dependency would be more code than 40 lines we can test; the invariant "nothing under /api is intercepted" is simple enough to prove with mutation tests.
Accepted   — icons are solid-colour placeholders; the worker was tested only against fakes (no real browser install, offline launch or Hosting `cleanUrls` check yet: T016 does it on the real URL); `%2e%2e` is not decoded by the `..` check (same-origin relative path, no escape).

## 2026-11-25 — The session lives only in TanStack Query and every end of session wipes the rest  (feature: staff-auth, task: T013-T014)
Context   — staff share phones; a late `/me` answer, a failed sign-out call or a cached query could show the previous member's screen or data.
Decision   — the session is the query `["session"]` (401 resolves to `null`, not an error; `staleTime: 0`, `refetchOnMount: false`, refetch on focus, reconnect and `pageshow` from the back/forward cache; `retry: 1`, 500 ms). Sign-in and sign-out cancel any in-flight session fetch before setting the cache; sign-out, a 401 from `/me`, a 401 from any other call and sign-in remove every non-session query; mutations use `gcTime: 0`. The error screen shows only when there is no data, so a failed background refetch keeps the app visible. Sign-out always wipes locally; if the server call is not confirmed (network failure, timeout, any non-2xx other than 401) the sign-in screen says so, because the 14-day cookie may still be valid. Every request has a 15 s timeout (`AbortSignal.timeout`, a caller signal is combined). The password is kept in the input after offline, timeout, busy, validation and generic errors, and cleared after wrong credentials and lockout. No router and no Zustand: nothing here is UI state beyond the sign-out notice, held outside the cache.
Why        — server data only in TanStack Query (constitution 3); an async response must never overwrite a newer session state.
Accepted   — a failed password stays in the mutation variables while the form is mounted (memory only, not in the DOM); `messages.sessionExpired` is defined but not shown (expiry just returns to sign-in); no offline banner; focus management, `aria-describedby` and landmarks go to T019; real bfcache and password-manager behaviour not checked; a sign-out answered 401 counts as confirmed (the server session is already gone).

## 2026-11-26 — Accessibility and offline behaviour of the sign-in screens  (feature: staff-auth, task: T019)
Context   — constitution 19 and 20: keyboard-navigable, visible focus, labelled controls, 44 px targets, a clear message offline. Staff use an installed PWA on shared phones.
Decision   — every top-level screen is a `<main>` with an `h1` that takes focus on mount; after a failed sign-in focus goes to the password input (wrong credentials), to the first empty field (validation) or to the alert (anything else), and `aria-describedby`/`aria-invalid` appear only on the fields the error concerns. Submit and Salir use `aria-disabled` plus a same-tick ref guard instead of `disabled`, so focus is kept and Enter still reaches the guard; pending labels read "Ingresando…" and "Saliendo…". The first-load error screen focuses its heading; the loading screen takes focus only after a Retry. The offline banner is an always-mounted `role="status"` paragraph after the `h1`, filled only when the browser reports offline or the session refetch failed with a `NetworkError` (never for a 500), and says "Conexión restablecida." until the next state change. Mutations use `networkMode: "always"`: React Query would otherwise pause them while the browser reports offline, leaving sign-in spinning and sign-out never wiping local state. `axe-core` 4.14.0 (exact, dev only) runs on a container, so page-level rules do not apply: each state also asserts one `main` and one `h1`, and a negative control proves axe can fail.
Why        — the keyboard and screen-reader path is the same path the owner and staff use at the counter; the two bugs found while writing red tests (paused mutations offline, a same-tick double sign-out) were real.
Accepted   — `role="alert"` plus a focus move can announce an error twice (needs a real screen reader, T016); no automatic retry of an unconfirmed server sign-out; no `h1:focus` styling, forced-colors or dark mode; `color-contrast` is off in jsdom, so the ratios (pending button 6.1:1, alert 7.3:1, banner 9.95:1, focus ring 6.2:1) were computed by hand, not measured; 44 px targets and the focus ring are only checked on the stylesheet text.

## 2026-11-26 — API ships as a Cloud Run container behind a Hosting `/api/**` rewrite, configured by a deploy script  (feature: staff-auth, task: T015)
Context   — constitution 22-25: one origin, Cloud Run behind Hosting, Atlas through a secret, the `__session` cookie is the only one Hosting forwards.
Decision   — `backend/Dockerfile` (node:24-slim, multi-stage, runs as `node`, `node dist/server.js`, no env baked in). `firebase.json` rewrites `/api/**` to the Cloud Run service `waxline-api` in `us-central1` before the SPA fallback, and serves `/sw.js` and `/index.html` with `no-cache`. `.firebaserc` points at `waxline-mza`. `deploy/deploy-api.sh` holds the Cloud Run flags and their reasons: concurrency 4 (the argon2 cap per instance), max-instances 2 (cost and flood cap), min-instances 0 (owner decides cost against cold starts), `MONGODB_URI` from Secret Manager secret `waxline-mongodb-uri`, `ALLOWED_ORIGINS` from the Hosting origin.
Why        — one script keeps flags and their why-comments together; secrets are injected at run time and never stored in the image or the repo.
Accepted   — `backend/package-lock.json` was regenerated with npm 11.19.1 because the image's npm rejected the committed lock (two optional beta entries and `peer` flags; no version changed); the Hosting origin `https://waxline-mza.web.app` is a placeholder to confirm; the script is untested against gcloud; the rewrite is unexercised on a live URL (T016); Atlas and the secret do not exist yet.

## 2026-11-26 — Owner confirms Cloud Run minimum instances 0 and the Hosting origin  (feature: staff-auth, after T017)
Context   — two open choices from T015 and T016: cold starts against cost, and the Hosting origin allowed in `ALLOWED_ORIGINS`.
Decision   — minimum instances stay at 0 (first sign-in after idle is slow; staff use is light). `ALLOWED_ORIGINS` stays `https://waxline-mza.web.app`. Both are set in `deploy/deploy-api.sh`.
Why        — the owner accepts a slow first request in exchange for not paying for an idle instance; the current origin is the one that works.
Accepted   — Atlas network access stays open to all addresses (plan risk 3), and the owner has not recorded a fixed egress option.
