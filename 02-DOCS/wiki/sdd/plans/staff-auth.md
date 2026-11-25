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

> Spec: [staff-auth](../specs/staff-auth.md) · Constitution: [v1.0.0 provisional](../constitution.md)
> Revision 2026-11-24: deployment moved to Cloud Run + Atlas behind Firebase Hosting (constitution v1.1.0).
> Isolation: work goes straight on `main` (owner's decision at install, constitution principle 12); no worktree because no other session works in this folder.

## 0. Global constraints (verbatim, every task honors them)

- Session lifetime: 14 days since last use (sliding). Expiry is checked in code on every request; database TTL cleanup is housekeeping only.
- Lockout: 5 failed sign-ins per username within 15 minutes, counted per lower-cased username whether or not it exists; locked response is HTTP 429, code `LOCKED`.
- Wrong or unknown username/password: HTTP 401, code `INVALID_CREDENTIALS`, same message text and body shape. Unknown username still pays one password-hash comparison against a dummy hash.
- No session: HTTP 401, code `UNAUTHENTICATED`.
- Error body, always: `{ "error": { "code": string, "message": string } }`.
- Session cookie: named `__session` (the only cookie Firebase Hosting forwards to the API), `HttpOnly; Secure; SameSite=Lax; Path=/`, value is an opaque random id (at least 32 random bytes), nothing else.
- Auth responses carry `Cache-Control: no-store`. CORS is disabled; front end and API share one origin.
- Password hash: argon2id with a per-password salt; the hash is never logged or returned.
- UI copy in Spanish (Argentina), kept in one messages module.
- Everything except `POST /api/auth/sign-in` and `GET /api/health` requires a valid session.

## 1. Context & constraints

- Spec acceptance criteria AC1-AC9, numbered in order of the spec's list (`spec §Acceptance criteria`), define the behaviour; constitution 14-18 fix the security floor.
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

- `backend/auth`: sign-in, sign-out, current user, `requireStaff` middleware. One responsibility: decide who is calling.
- `backend/lockout`: counts failed attempts per username window.
- `backend/staff`: staff accounts (internal) plus a command-line script to create the first account.
- `frontend/features/auth`: sign-in screen, session query, route guard, sign-out action.
- `frontend/shared/api`: one fetch wrapper that calls same-origin `/api/...` and turns any 401 into "session lost".
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
  - refreshes last-used when older than 1 hour (cheap sliding window)
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

Database for integration tests: a real in-memory MongoDB, so unique and TTL index behaviour is not faked. The clock is injected so no test sleeps.

## 6. Sequencing & dependencies

0. **Spike S0 (first task, blocks every other implementation task):** deploy a throwaway Hosting page and Cloud Run endpoint that sets and reads a `__session` cookie; confirm on a real iPhone (Safari, then installed PWA, then close and reopen) that it survives. Human step: a real phone and the Firebase project.
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

Rollback: the feature is additive with no data migration for other features; revert the commits and drop the three collections. Deployment rollback: redeploy the previous Cloud Run revision and Hosting release.

## Significant decisions to log

- Server-side sessions in MongoDB with an opaque cookie, chosen over stateless tokens so sign-out is real.
- argon2id for passwords (constitution 16 allows argon2 or bcrypt).
- One origin: Cloud Run behind a Hosting `/api/**` rewrite, MongoDB on Atlas, cookie named `__session` (replaces the earlier same-registrable-domain Option A).

## Tasks
<!-- generated by tasks on 2026-11-24; IDs are stable, do not renumber. AC1-AC9 = the spec's acceptance criteria in order: 1 correct sign-in, 2 wrong password, 3 unknown user, 4 signed-out refused, 5 stays signed in 14 days, 6 sign-out, 7 lockout, 8 expired session, 9 refusal shape + HTTPS. "Enabler" tasks trace to the criteria they make possible. Risk tier is the path forecast from `rsc risk`; `implement` recomputes it on the real diff. -->

| ID | [P] | Task | Done-check | Depends-on | Trace | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| T001 |  | Run spike S0: throwaway Hosting page + Cloud Run endpoint that sets and reads a `__session` cookie | Manual on a real iPhone: Safari, then installed PWA, close and reopen, cookie still read back; result recorded in `verifications/` | — | AC5 | 1 |
| T002 |  | Add repo foundation: `backend/` and `frontend/` packages, strict TS, ESLint, Prettier, Vitest, `.env.example`, `.gitignore` | In both packages `npm run lint`, `npm run typecheck` and `npm test` exit 0 on a smoke test | T001 | AC1-AC9 (enabler) | 2 |
| T003 | [P] | Write failing tests for password hashing and dummy comparison | `npm test -w backend -- hash` fails: module missing | T002 | AC2, AC3 | 2 |
| T004 |  | Implement password hashing (argon2id) and dummy hash | T003 green; hash differs per call; wrong password false | T003 | AC2, AC3 | 2 |
| T005 | [P] | Write failing tests for lockout (5 in 15 min, per username, unknown the same, injectable clock) | `npm test -w backend -- lockout` fails: module missing | T002 | AC7 | 2 |
| T006 |  | Implement lockout store | T005 green incl. 6th attempt refused and window expiry | T005 | AC7 | 2 |
| T007 | [P] | Write failing tests for sessions (create, resolve, 14-day sliding expiry checked in code, destroy) | `npm test -w backend -- sessions` fails: module missing | T002 | AC5, AC6, AC8 | 2 |
| T008 |  | Implement session store | T007 green incl. day 13 valid, day 15 refused with record still present | T007 | AC5, AC6, AC8 | 2 |
| T009 |  | Write failing route tests: sign-in, me, sign-out, `requireStaff`, error shape, same response for wrong and unknown, `no-store`, cookie named `__session` with flags | `npm test -w backend -- routes` fails: routes missing | T004, T006, T008 | AC1-AC4, AC6, AC9 | 2 |
| T010 |  | Implement auth routes, `requireStaff` and health route | T009 green; unauthenticated call to any other route returns 401 | T009 | AC1-AC4, AC6, AC9 | 2 |
| T011 |  | Add create-first-account script (password from interactive prompt, never argv) | Test: script stores a hash and never echoes or logs the password; sign-in with it succeeds in a route test | T010 | AC1 (enabler) | 1 (path), expect 2 (password handling) |
| T012 | [P] | Add frontend shell: Vite app, PWA manifest and service worker, fetch wrapper, Spanish messages module | `npm run build -w frontend` exits 0; test asserts the worker never caches `/api/**` | T002 | AC5 (enabler) | 1 |
| T013 |  | Write failing frontend tests: guard shows sign-in on 401, sign-in renders the name, sign-out returns to sign-in | `npm test -w frontend -- auth` fails: feature missing | T012 | AC1, AC4, AC6 | 2 |
| T014 |  | Implement frontend auth (session query, sign-in screen, guard, sign-out) | T013 green; typecheck and lint clean | T013 | AC1, AC4, AC6 | 2 |
| T015 |  | Add deployment config: API Dockerfile, Hosting rewrite for `/api/**`, `.firebaserc`, secret-based Atlas connection, proxy trust setting | Container builds locally and `GET /api/health` returns 200 from it; `firebase.json` rewrite validates | T010, T014 | AC9 | 1 (path), expect 2 (secrets) |
| T016 |  | Deploy and run the integration pass on the real URL plus the manual phone check | One line per AC1-AC9 recorded in `verifications/staff-auth-<date>.md`; AC5 checked on a real iPhone | T011, T015 | AC1-AC9 | 2 |
| T017 |  | Closer: every done-check above passes and the verify gate is green | Every row checked with its evidence; `npx @ericrisco/rsc spec gate` PASS; lint, typecheck and tests exit 0 in both packages | all | all ACs | — |

**T001 — Interfaces**
- Consumes: Firebase project id (human), Blaze billing and Atlas cluster (Q13).
- Produces: a recorded yes/no on "installed iOS PWA keeps `__session`"; throwaway files under `spike/` deleted afterwards.

**T004 — Interfaces**
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain: string, hash: string): Promise<boolean>`, `DUMMY_HASH: string` (a valid argon2id hash of a random value, created at start-up).

**T006 — Interfaces**
- Produces: `isLocked(username: string, now: Date): Promise<boolean>`, `recordFailure(username: string, now: Date): Promise<void>`, `clear(username: string): Promise<void>`; the username is trimmed and lower-cased inside, so unknown names behave the same.

**T008 — Interfaces**
- Produces: `create(staffId: string, now: Date): Promise<{ id: string }>` (id is the raw cookie value, stored only as a hash), `resolve(id: string, now: Date): Promise<{ staffId: string } | null>`, `destroy(id: string): Promise<void>`; constants `SESSION_DAYS = 14`, `TOUCH_AFTER_MS = 3600000`.

**T010 — Interfaces**
- Consumes: T004, T006, T008 signatures above.
- Produces: `POST /api/auth/sign-in` body `{ username: string, password: string }` → `200 { user: { id: string, displayName: string } }` with `Set-Cookie: __session=...`, or `401 { error: { code: "INVALID_CREDENTIALS", message } }`, or `429 { error: { code: "LOCKED", message } }`; `GET /api/auth/me` → `200 { user: { id, displayName } }` or `401 { error: { code: "UNAUTHENTICATED", message } }`; `POST /api/auth/sign-out` → `204`; `GET /api/health` → `200 { status: "ok" }`.

**T014 — Interfaces**
- Consumes: the T010 HTTP contract; all calls are same-origin `/api/...` with cookies sent.
- Produces: `useSession(): UseQueryResult<{ id: string; displayName: string }>`, `<RequireStaff>` route guard, `signIn(username, password)` and `signOut()` mutations that invalidate the session query.

## Review Workload Forecast

| Dimension | Forecast | Why |
| --- | --- | --- |
| Estimated changed lines | 1,800 to 2,500 | two packages, three auth modules with tests, routes, UI, config |
| Files / areas | about 40 files across backend auth, routes, scripts, frontend shell and auth, deployment config | |
| Risk | max tier 2; 12 of 17 tasks are tier 2 by path | tier-2 tasks need the three-refuter panel and a human merge approval |
| Suggested delivery | ask-on-risk | far over the 400-line budget; work lands on `main` as one work-unit commit per slice (T002; T003-T004; T005-T006; T007-T008; T009-T010; T011; T012; T013-T014; T015; T016-T017) |

Chained PRs recommended: Yes (size), but the owner's workflow commits straight to `main`, so the split would be work-unit commits, not PRs. Decision needed before apply: Yes.
