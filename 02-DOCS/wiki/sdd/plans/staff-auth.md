---
type: plan
title: Plan — Staff sign-in
description: Technical blueprint for the staff-auth spec: components, contracts, data, tests, sequencing, risks.
tags: [sdd, plan]
timestamp: 2026-11-24T00:00:00Z
topic: sdd
slug: staff-auth
status: draft
---

# Plan — Staff sign-in

> Spec: [staff-auth](../specs/staff-auth.md) · Constitution: [v1.1.0 provisional](../constitution.md)
> Revision 2026-11-24: deployment moved to Cloud Run + Atlas behind Firebase Hosting (constitution v1.1.0).
> Isolation: work goes straight on `main` (owner's decision at install, constitution principle 12); no worktree because no other session works in this folder.

## 0. Global constraints (verbatim, every task honors them)

- Session lifetime: 14 days since last use (sliding). Expiry is checked in code on every request; database TTL cleanup is housekeeping only.
- Lockout: 5 failed sign-ins per username within 15 minutes, counted per lower-cased username whether or not it exists; locked response is HTTP 429, code `LOCKED`.
- Wrong or unknown username/password: HTTP 401, code `INVALID_CREDENTIALS`, same message text and body shape. Unknown username still pays one password-hash comparison against a dummy hash.
- No session: HTTP 401, code `UNAUTHENTICATED`. Invalid input (wrong types, operator objects such as `{ "$ne": null }`): HTTP 400, code `VALIDATION_ERROR`. State-changing request that carries an `Origin` header not listed in the `ALLOWED_ORIGINS` setting (comma-separated, per environment, including the local dev origin): HTTP 403, code `FORBIDDEN_ORIGIN`; a request with no `Origin` header is accepted (the cookie's `SameSite=Lax` and JSON-only bodies still apply).
- Error body, always: `{ "error": { "code": string, "message": string } }`.
- Session cookie: named `__session` (the only cookie Firebase Hosting forwards to the API), `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1209600` (14 days, so the browser keeps it after the app is closed), value is an opaque random id (at least 32 random bytes), nothing else.
- Auth responses carry `Cache-Control: no-store`. CORS is disabled; front end and API share one origin.
- Password hash: argon2id with a per-password salt; the hash is never logged or returned.
- UI copy in Spanish (Argentina), kept in one messages module.
- Everything except `POST /api/auth/sign-in` and `GET /api/health` requires a valid session.

## 1. Context & constraints

- Spec acceptance criteria AC1-AC9, numbered in order of the spec's list (`spec §Acceptance criteria`), define the behaviour; constitution 14-17 and 22-25 fix the security floor.
- Front end on Firebase Hosting, API as a Cloud Run container reached through a Hosting rewrite of `/api/**`, MongoDB on Atlas (decision log 2026-11-24, constitution 22-25). One origin; the main design pressure is that Hosting strips every cookie except `__session` before the API.
- Constitution 3: the signed-in user is server state, so it lives in TanStack Query. Zustand holds nothing for this feature.

## 2. Architecture

```text
 [Browser / installed PWA] --HTTPS--> [Firebase Hosting]
                                         |  static files: frontend/
                                         |  /api/** rewrite
                                         v
                                   [Cloud Run: Express container: backend/] --> [MongoDB Atlas]
```

- `backend/src/routes/auth` and `backend/src/services/{auth,sessions,hash}`: sign-in, sign-out, current user, `requireStaff` middleware. One responsibility: decide who is calling.
- `backend/src/services/lockout`: counts failed attempts per username window; a fixed window starting at the first failure.
- `backend/src/models/staff` (staff accounts) plus `backend/scripts/create-staff` to create the first account.
- `frontend/src/features/auth`: sign-in screen, session query, route guard, sign-out action.
- `frontend/src/shared/api`: one fetch wrapper that calls same-origin `/api/...` and turns any 401 into "session lost". In development, the Vite dev server proxies `/api` to the local API, since CORS stays off.
- `frontend` PWA shell: manifest + service worker so the app is installable (constitution 20). The service worker never caches `/api/**`.

**Key decision: one origin through a Hosting rewrite.** Hosting serves the front end and forwards `/api/**` to the Cloud Run service, so the browser only ever talks to one address. The session cookie is therefore first-party, no CORS is needed and there is no domain to buy or connect. Server-side sessions in MongoDB make sign-out and revocation real.
- Constraint from the Firebase docs (verified 2026-11-24): Hosting strips every cookie except `__session` before the request reaches Cloud Run, so the session cookie must be named `__session`.
- Alternative considered: front end on Firebase and API on the owner's own server (two origins). Rejected: cookie becomes cross-site and Safari on iOS is expected to block it, which would force a token in page storage.
- Alternative considered: Firestore + Firebase Authentication. Rejected by the owner: it abandons Express and MongoDB (constitution 2).

## 3. Interfaces & contracts

```text
signIn(username, password) -> Session | InvalidCredentials | Locked
  - lockout checked first, per lower-cased username, same for unknown names
  - unknown username still performs one dummy hash comparison
  - on success: creates a session record, sets the cookie, clears the attempt count
currentUser(cookie) -> StaffUser{id, displayName} | Unauthenticated
  - valid only if the session exists and last-used is within 14 days
  - refreshes last-used when older than 1 hour (cheap sliding window) and, in the same step, re-sends the cookie with a fresh `Max-Age=1209600`; "last use" therefore has one-hour granularity
signOut(cookie) -> void
  - deletes that session record only; other devices keep theirs
requireStaff(request) -> attaches StaffUser | 401 UNAUTHENTICATED
createStaff(username, displayName) -> StaffUser   (command line; password read from an interactive prompt, never from arguments)
```

HTTP surface (paths keep the `/api` prefix that Hosting forwards): `POST /api/auth/sign-in`, `POST /api/auth/sign-out`, `GET /api/auth/me`, `GET /api/health`. Request bodies are validated by schema at the route (constitution 17); responses never include the hash.

## 4. Data model & flow

- `staff`: id, username (stored lower-cased, unique index), displayName, passwordHash, createdAt.
- `sessions`: id (the opaque cookie value, stored as a hash), staffId, createdAt, lastUsedAt; TTL index for cleanup.
- `signInAttempts`: key (lower-cased username), count, windowStart; TTL index for cleanup. Window logic is evaluated in code, not by the TTL clock, because MongoDB deletes expired documents only about once a minute.
- Flow: sign-in → lockout check → find staff or dummy → verify hash → create session → cookie. Every other request → read cookie → load session → check 14 days → attach user.

## 5. Testing strategy (Vitest, per acceptance criterion)

| # | Criterion | Level | Asserts | Fakes |
| --- | --- | --- | --- | --- |
| 1 | Correct sign-in shows name | integration (API) + component (UI) | 200, cookie set, name returned and rendered | none / mocked fetch |
| 2-3 | Wrong password and unknown user identical | integration | same status, same message, same body keys | none |
| 4 | Signed-out access refused | integration + component | 401 on every protected route; guard shows sign-in screen | none / mocked 401 |
| 5 | Still signed in within 14 days | integration | `/auth/me` ok at day 13 | injectable clock |
| 6 | Sign-out ends session | integration | old cookie then returns 401; another device's session still valid | none |
| 7 | Lockout after 5 in 15 min | integration | 6th with correct password gets 429 and "try later"; unknown user locks identically | injectable clock |
| 8 | Expired after 14 days | integration | `/auth/me` 401 at day 15 even if the record still exists | injectable clock |
| 9 | Refusals use error shape over HTTPS | integration | body shape on all refusals; cookie has `Secure` | none |
| PWA | Installed PWA keeps session | manual | recorded check on a real iPhone and an Android phone | none |

Database for integration tests: a real MongoDB running in a Docker container (`mongo:7`, started by `scripts/test-db.sh`), so unique and TTL index behaviour is not faked; tests and the pre-commit hook need Docker running (decision 2026-11-25). The clock is injected so no test sleeps.

## 6. Sequencing & dependencies

0. **Spike S0 (first task, blocks every other implementation task):** deploy a throwaway Hosting page and Cloud Run endpoint that sets and reads a `__session` cookie; confirm on a real iPhone (Safari, then installed PWA, then close and reopen) that it survives. Human step: a real phone and the Firebase project; needs Q13 resolved (Blaze billing, Atlas cluster). If it fails: stop every task, record the evidence and return to `plan`; the candidate fallbacks are a short-lived token kept in the app's storage (weakens constitution 17) or a managed sign-in (Firebase Authentication); either is a constitution amendment the owner must approve.
1. Repo foundation: `backend/` and `frontend/` packages, TypeScript strict, ESLint, Prettier, Vitest, `.env.example`, `.gitignore` entries.
2. Backend core: staff model, hashing, session store, lockout, injectable clock.
3. Backend routes and `requireStaff`, error shape, health route, `no-store` on auth responses.
4. Create-first-account script.
5. Frontend shell: Vite app, PWA manifest and service worker, shared fetch wrapper, messages module.
6. Frontend auth: session query, sign-in screen, route guard, sign-out.
7. Integration pass over all criteria, then the manual phone check on the real deploy.
8. Deployment configuration: Hosting rewrite for `/api/**`, container build for the API, Atlas connection through a secret, proxy trust setting. Human steps: enable Blaze billing, create the Atlas cluster, run the deploy. Touches always-human paths.

Steps 2-4 and 5-6 are independent of each other once step 1 exists.

## 7. Risks & open decisions

1. **Only `__session` reaches the API (high).** Trigger: any other cookie name, or a missing `no-store`. Mitigation: constitution 24, a test asserting the cookie name, spike S0.
2. **Installed iOS PWA loses the session (medium, unverified).** Mitigation: spike S0 first, manual phone check at the end.
3. **Atlas network access (medium).** Cloud Run has no fixed outbound address, so the Atlas allow-list tends to open to every address. Mitigation: strong database credentials, TLS, a dedicated least-privilege database user; a fixed egress address later if the owner wants it.
4. **Cloud Run cold starts and billing (medium).** The first sign-in after idle can be slow, and the project needs the Blaze plan (a billing account). Mitigation: owner decides on a minimum instance; cost not estimated here.
5. **Lockout can be abused (medium).** Someone can lock a colleague out for 15 minutes. Accepted by the spec; revisit with roles.
6. **CSRF (medium).** Cookie sessions need protection: `SameSite=Lax`, JSON-only bodies, an origin check on state-changing routes.
7. **Proxy trust (medium).** `Secure` cookies and the client address depend on trusting the Hosting/Cloud Run proxy chain; if misconfigured the cookie is never set. Mitigation: explicit setting and a smoke check on the real deploy.
8. **Timing leak on unknown usernames (low).** Mitigated by the dummy hash; tested by comparing code paths, not wall-clock time.
9. **Service worker caching authenticated data (medium).** The worker caches only static assets; one test asserts `/api/**` is never cached.
10. **TTL lag (low).** Expiry decided in code, never by document disappearance.
11. **Lockout check and record are two steps (low).** More than 5 parallel wrong guesses can pass `isLocked` before the counts land; the in-flight cap of 4 bounds it. A non-finite injected `now` makes the lock fail open; only a buggy clock can cause it.
12. **Sessions per staff are unbounded and there is no revoke-all (low).** Every sign-in adds a session that lives until 14 idle days; password change and account deactivation are out of scope (spec non-goals), so `destroyAllForStaff` arrives with the first account-management feature. `requireStaff` re-checks that the staff record still exists.

Rollback: the feature is additive with no data migration for other features; revert the commits and drop the three collections. Deployment rollback: redeploy the previous Cloud Run revision and Hosting release.

## Significant decisions to log

- Server-side sessions in MongoDB with an opaque cookie, chosen over stateless tokens so sign-out is real.
- argon2id for passwords (constitution 16 allows argon2 or bcrypt).
- One origin: Cloud Run behind a Hosting `/api/**` rewrite, MongoDB on Atlas, cookie named `__session` (replaces the earlier same-registrable-domain Option A).

## Tasks
<!-- generated by tasks on 2026-11-24; IDs are stable, do not renumber. AC1-AC9 = the spec's acceptance criteria in order: 1 correct sign-in, 2 wrong password, 3 unknown user, 4 signed-out refused, 5 stays signed in 14 days, 6 sign-out, 7 lockout, 8 expired session, 9 refusal shape + HTTPS. "Enabler" tasks trace to the criteria they make possible. Risk tier is the path forecast from `rsc risk`; `implement` recomputes it on the real diff. -->

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Run spike S0: throwaway Hosting page + Cloud Run endpoint that sets and reads a `__session` cookie | Manual on a real iPhone: Safari, then installed PWA, close and reopen, cookie still read back; result recorded in `verifications/` | Q13 resolved (Blaze, Atlas, project id) | AC5 | 1 |
| T002 |  | Add repo foundation: `backend/` and `frontend/` packages (one lockfile each), strict TS, ESLint, Prettier, Vitest with coverage, `.nvmrc`, pre-commit hook, `.env.example`, `.gitignore` | In both packages `npm run lint`, `npm run typecheck` and `npm test` exit 0 on a smoke test; `.nvmrc` and `engines` present; coverage threshold 70% configured; a pre-commit hook runs lint, typecheck and tests; the backend test harness exists (Docker-backed MongoDB helper, `createApp` factory, injectable clock) | T001 | AC1-AC9 (enabler) | 2 |
| T003 | [P] | Write failing tests for password hashing and dummy comparison | `npm --prefix backend test -- hash` fails: module missing | T002 | AC2, AC3 | 2 |
| T004 |  | Implement password hashing (argon2id) and dummy hash | T003 green; hash differs per call; wrong password false | T003 | AC2, AC3 | 2 |
| T005 | [P] | Write failing tests for lockout (5 in 15 min, per username, unknown the same, injectable clock) | `npm --prefix backend test -- lockout` fails: module missing | T002 | AC7 | 2 |
| T006 |  | Implement lockout store | T005 green incl. 6th attempt refused and window expiry | T005 | AC7 | 2 |
| T007 | [P] | Write failing tests for sessions (create, resolve, 14-day sliding expiry checked in code, destroy) | `npm --prefix backend test -- sessions` fails: module missing | T002 | AC5, AC6, AC8 | 2 |
| T008 |  | Implement session store | T007 green incl. day 13 valid, day 15 refused with record still present | T007 | AC5, AC6, AC8 | 2 |
| T018 |  | Add staff model and lookup by username normalised with `normaliseUsername` from `services/username.ts` (unique index) with its tests | `npm --prefix backend test -- staff` green; a duplicate username is rejected; lookup of an unknown name returns null | T002 | AC1-AC3 (enabler) | 2 |
| T009 |  | Write failing route tests for every criterion: sign-in, me, sign-out, `requireStaff`, same response for wrong and unknown, sixth attempt gets 429 `LOCKED` even with the right password and unknown names lock the same, `/me` valid at day 13 and 401 at day 15 with the record present, cookie named `__session` with `Max-Age` and flags, a touched session re-sends the cookie, signing out on one device leaves another device's session valid, malformed JSON and unknown routes and server faults all return the error shape, a body over 10 kB gets 413 in the error shape, a username that is not a string of 1 to 64 characters gets 400 `VALIDATION_ERROR`, a password longer than 1024 characters or not well-formed Unicode gets 400 `VALIDATION_ERROR`, a canonically equivalent password (NFC versus NFD form) signs in, more than 4 sign-ins verifying at once makes the extra ones wait or get 429 `TOO_MANY_REQUESTS`, `no-store`, error shape, `{ "$ne": null }` as username gives 400 `VALIDATION_ERROR`, foreign `Origin` on a POST gives 403 `FORBIDDEN_ORIGIN` | `npm --prefix backend test -- routes` fails: routes missing | T004, T006, T008, T018 | AC1-AC9, constitution 17 | 2 |
| T010 |  | Implement auth routes, input validation, origin check, `requireStaff`, health route, and the startup call to `ensureLockoutIndexes`; the session id comes only from the `__session` cookie, the cookie is re-sent with `Max-Age=1209600` only when `touched` is true and cleared on a `null` resolve and on sign-out (which calls `destroy`), `requireStaff` loads the staff record after `resolve` and refuses when the account no longer exists, and one injected `now` is passed to every service | T009 green; unauthenticated call to any other route returns 401 | T009 | AC1-AC9, constitution 17 | 2 |
| T011 |  | Add create-first-account script (password from interactive prompt, never argv) | Test: script stores a hash and never echoes or logs the password; sign-in with it succeeds in a route test | T010, T018 | AC1 (enabler) | 1 (path), expect 2 (password handling) |
| T012 | [P] | Add frontend shell: Vite app with `/api` dev proxy, PWA manifest and service worker, fetch wrapper, Spanish messages module | `npm --prefix frontend run build` exits 0 and the output holds a web manifest and a service worker file; test asserts the worker never caches `/api/**` | T002 | AC5, constitution 20 (enabler) | 1 |
| T013 |  | Write failing frontend tests: guard shows sign-in on 401, sign-in renders the name, sign-out returns to sign-in, and a wrong password shows the generic wrong-credentials message and not "session lost" | `npm --prefix frontend test -- auth` fails: feature missing | T012 | AC1, AC4, AC6 | 2 |
| T014 |  | Implement frontend auth (session query, sign-in screen, guard, sign-out) | T013 green; typecheck and lint clean | T013 | AC1, AC4, AC6 | 2 |
| T019 |  | Add accessibility and offline checks for the sign-in screen: labelled fields, visible focus, touch targets of 44px or more, clear message when the API is unreachable | `npm --prefix frontend test -- a11y` passes with zero violations from the axe checker; a test shows the offline message when fetch rejects | T014 | AC1, constitution 19 and 20 | 1 |
| T015 |  | Add deployment config: API Dockerfile, Hosting rewrite for `/api/**`, `.firebaserc`, secret-based Atlas connection, proxy trust setting | Container builds locally and `GET /api/health` returns 200 from it; `firebase.json` rewrite validates | T010, T014 | AC9 | 1 (path), expect 2 (secrets) |
| T016 |  | Deploy and run the integration pass on the real URL plus the manual phone check | One line per AC1-AC9 recorded in `verifications/staff-auth-<date>.md`; AC5 checked on a real iPhone; the deployed app passes the browser's installability check | T011, T015, T019 | AC1-AC9, constitution 20 | 2 |
| T017 |  | Closer: every done-check above passes and the verify gate is green | Every row checked with its evidence; `npx @ericrisco/rsc spec gate` PASS; lint, typecheck and tests exit 0 in both packages | all | all ACs | — |

**T001 — Interfaces**
- Consumes: Firebase project id (human), Blaze billing and Atlas cluster (Q13).
- Produces: a recorded yes/no on "installed iOS PWA keeps `__session`", plus the `Origin` and `X-Forwarded-Host` values the API actually receives through the rewrite (they set `ALLOWED_ORIGINS`); throwaway files under `spike/` deleted afterwards.

**Test-first tasks** T003, T005, T007, T009 and T013 use the Interfaces block of the implementation task they precede (T004, T006, T008, T010, T014).

**T002 — Interfaces**
- Produces: `createApp(deps: { db: Db; now: () => Date; allowedOrigins: string[] }): Express` and a test helper `startTestDb(): Promise<{ db: Db; stop(): Promise<void> }>` backed by a real MongoDB in Docker (`scripts/test-db.sh up`); routes and services take `now` instead of calling `new Date()`.

**T004 — Interfaces**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`, `DUMMY_HASH: string` (a valid argon2id hash of a random value, created at start-up).

**T006 — Interfaces**
- Produces, in `backend/src/services/lockout.ts`: `createLockout(db: Db): { isLocked(username: string, now: Date): Promise<boolean>; recordFailure(username: string, now: Date): Promise<void>; clear(username: string): Promise<void> }` and `ensureLockoutIndexes(db: Db): Promise<void>`. The username key comes from `normaliseUsername(username: string): string` in `backend/src/services/username.ts` (trim, lower-case), shared with the staff lookup so a variant spelling cannot dodge the lock. Callers must pass a string; the route validates type and length before calling.

**T008 — Interfaces**
- Produces, in `backend/src/services/sessions.ts`: `createSessions(db: Db): { create(staffId: string, now: Date): Promise<{ id: string }>; resolve(id: string, now: Date): Promise<{ staffId: string; touched: boolean } | null>; destroy(id: string): Promise<void> }`, `ensureSessionIndexes(db: Db): Promise<void>`, `isValidSessionId(id: unknown): id is string`, constants `SESSION_DAYS = 14`, `TOUCH_AFTER_MS = 3600000`. `create` and `resolve` throw `TypeError` for an invalid `now` (`assertValidNow` in `services/clock.ts`, also used by the lockout) and `create` for a `staffId` that is not a non-empty string. A session is valid while `now <= lastUsedAt + 14 days`. `touched` is true when last-used was refreshed, so the route re-sends the cookie.

**T010 — Interfaces**
- Consumes: T004, T006, T008 and T018 signatures above.
- Produces: `POST /api/auth/sign-in` body `{ username: string, password: string }` → `200 { user: { id: string, displayName: string } }` with `Set-Cookie: __session=...; Max-Age=1209600`, or `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 LOCKED`, `403 FORBIDDEN_ORIGIN`, `429 TOO_MANY_REQUESTS` (all as `{ error: { code, message } }`); `GET /api/auth/me` → `200 { user: { id, displayName } }` or `401 { error: { code: "UNAUTHENTICATED", message } }`; `POST /api/auth/sign-out` → `204`; `GET /api/health` → `200 { status: "ok" }`.

**T010 — Password input helper**
- Produces: `normalizePassword(plain: string): string | null` in `backend/src/services/password-input.ts`; returns `null` when the string is longer than 1024 characters or not well-formed (`String.prototype.isWellFormed()`), otherwise `plain.normalize("NFKC")`. Sign-in and the create-first-account script both call it before `hashPassword` and `verifyPassword`, so a password set with one form always signs in. Verifications in flight are capped at 4 by a counter in the sign-in route; the cap and body limit (`express.json({ limit: "10kb" })`) are settings of `createApp`.

**T011 — Interfaces**
- Consumes: `normalizePassword` (T010), `hashPassword` (T004) and the staff model (T018).
- Produces: `npm --prefix backend run create-staff -- <username> <displayName>`, which asks for the password on a hidden prompt and exits 0 on success, 1 if the username exists.

**T012 — Interfaces**
- Produces: `apiFetch(path: string, init?: RequestInit): Promise<Response>` (same-origin, sends cookies, throws `SessionLostError` on 401 except when called with `{ expectSessionLoss: false }`, which sign-in uses so a wrong password shows its own message); `messages` (Spanish, Argentina) keyed by string id.

**T015 — Interfaces**
- Produces: environment keys `MONGODB_URI` (secret), `ALLOWED_ORIGINS`, `TRUST_PROXY` (set to `1`), `PORT` (supplied by Cloud Run); start command `node dist/server.js`; `firebase.json` rewrite `{ source: "/api/**", run: { serviceId, region } }`.

**T018 — Interfaces**
- Produces: `findByUsername(username: string): Promise<{ id: string; displayName: string; passwordHash: string } | null>` (trims and lower-cases inside); `createStaff(input: { username: string; displayName: string; passwordHash: string }): Promise<{ id: string }>`, rejects a duplicate username.

**T014 — Interfaces**
- Consumes: the T010 HTTP contract; all calls are same-origin `/api/...` with cookies sent.
- Produces: `useSession(): UseQueryResult<{ id: string; displayName: string }>`, `<RequireStaff>` route guard, `signIn(username, password)` and `signOut()` mutations that invalidate the session query.

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | 1,800 to 2,500 | two packages, three auth modules with tests, routes, UI, config |
| Files / areas | about 40 files across backend auth, routes, scripts, frontend shell and auth, deployment config | |
| Risk | max tier 2; 13 of 19 tasks are tier 2 by path | tier-2 tasks need the three-refuter panel and a human merge approval |
| Suggested delivery | ask-on-risk | far over the 400-line budget; work lands on `main` as one work-unit commit per slice (T002; T003-T004; T005-T006; T007-T008; T018; T009-T010; T011; T012; T013-T014; T019; T015; T016-T017) |

Chained PRs recommended: Yes (size), but the owner's workflow commits straight to `main`, so the split would be work-unit commits, not PRs. Decision needed before apply: Yes.
