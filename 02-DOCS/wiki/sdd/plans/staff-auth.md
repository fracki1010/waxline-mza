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
- Everything except `POST /auth/sign-in` and `GET /health` requires a valid session.

## 1. Context & constraints

- Spec acceptance criteria 1-10 (`spec §Acceptance criteria`) define the behaviour; constitution 14-18 fix the security floor.
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

HTTP surface: `POST /auth/sign-in`, `POST /auth/sign-out`, `GET /auth/me`, `GET /health`. Request bodies are validated by schema at the route (constitution 17); responses never include the hash.

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
