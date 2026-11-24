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
> Isolation: work goes straight on `main` (owner's decision at install, constitution principle 12); no worktree because no other session works in this folder.

## 0. Global constraints (verbatim, every task honors them)

- Session lifetime: 14 days since last use (sliding). Expiry is checked in code on every request; database TTL cleanup is housekeeping only.
- Lockout: 5 failed sign-ins per username within 15 minutes, counted per lower-cased username whether or not it exists; locked response is HTTP 429, code `LOCKED`.
- Wrong or unknown username/password: HTTP 401, code `INVALID_CREDENTIALS`, same message text and body shape. Unknown username still pays one password-hash comparison against a dummy hash.
- No session: HTTP 401, code `UNAUTHENTICATED`.
- Error body, always: `{ "error": { "code": string, "message": string } }`.
- Session cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, value is an opaque random id (at least 32 random bytes), nothing else.
- Password hash: argon2id with a per-password salt; the hash is never logged or returned.
- UI copy in Spanish (Argentina), kept in one messages module.
- Everything except `POST /auth/sign-in` and `GET /health` requires a valid session.

## 1. Context & constraints

- Spec acceptance criteria 1-10 (`spec §Acceptance criteria`) define the behaviour; constitution 14-18 fix the security floor.
- Front end on Firebase Hosting, API on the owner's server (decision log 2026-11-24). Two origins is the main design pressure.
- Constitution 3: the signed-in user is server state, so it lives in TanStack Query. Zustand holds nothing for this feature.

## 2. Architecture

```text
 [Browser / installed PWA]  --HTTPS-->  [API: Express]  -->  [MongoDB]
   frontend/ (Firebase Hosting)          backend/ (own server)
   app.<domain>                          api.<domain>
```

- `backend/auth`: sign-in, sign-out, current user, `requireStaff` middleware. One responsibility: decide who is calling.
- `backend/lockout`: counts failed attempts per username window.
- `backend/staff`: staff accounts (internal) plus a command-line script to create the first account.
- `frontend/features/auth`: sign-in screen, session query, route guard, sign-out action.
- `frontend/shared/api`: one fetch wrapper that sends credentials and turns any 401 into "session lost".
- `frontend` PWA shell: manifest + service worker so the app is installable (constitution 20). The service worker never caches API responses.

**Key decision: how the session survives across the two origins.**
- Option A (recommended): serve front end and API under the **same registrable domain** (for example `app.<domain>` and `api.<domain>`). The cookie is then first-party, `SameSite=Lax` works, no third-party cookie is involved. Server-side sessions in MongoDB make sign-out and revocation real.
- Option B (fallback): different registrable domains, so the browser sees the cookie as third-party. Safari on iOS blocks third-party cookies by default, so the session would need a token in the page's storage instead. That token is exposed to any script injected into the page and weakens constitution 17-18. Use only if the owner has no domain.
- Recommendation: A. It requires the owner to have one domain, with a subdomain pointing at Firebase Hosting and another at the server. This is the gate recorded as blocking in the decision queue (Q10).

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

0. **Spike S0 (human + agent, blocks tasks):** with the real domain, serve a throwaway page and endpoint on the two subdomains and confirm on a real iPhone (installed PWA and Safari) that the cookie survives a reopen. If it fails, decide Option B explicitly.
1. Repo foundation: `backend/` and `frontend/` packages, TypeScript strict, ESLint, Prettier, Vitest, `.env.example`, `.gitignore` entries.
2. Backend core: staff model, hashing, session store, lockout, injectable clock.
3. Backend routes and `requireStaff`, error shape, CORS allow-list, health route.
4. Create-first-account script.
5. Frontend shell: Vite app, PWA manifest and service worker, shared fetch wrapper, messages module.
6. Frontend auth: session query, sign-in screen, route guard, sign-out.
7. Integration pass over all criteria, then the manual phone check.
8. Deployment configuration (Firebase hosting, server settings, cookie and CORS values per environment). This touches always-human paths.

Steps 2-4 and 5-6 are independent of each other once step 1 exists.

## 7. Risks & open decisions

1. **Cross-site session on iOS (high).** Trigger: Option B. Mitigation: Option A plus spike S0 before any task starts.
2. **Owner has no domain (high, decision).** Option A needs one. Without it, Option B weakens the security floor. Needs the owner's answer.
3. **Server behind a reverse proxy (medium).** `Secure` cookies and the client address need the proxy trusted; if misconfigured the cookie is never set. Mitigation: explicit proxy setting per environment and a deployed smoke check.
4. **Lockout can be abused (medium).** Someone can lock a colleague out for 15 minutes. Accepted by the spec; revisit with roles.
5. **CSRF (medium).** Cookie-based sessions need protection: `SameSite=Lax`, JSON-only bodies, and an origin check on state-changing routes.
6. **Timing leak on unknown usernames (low).** Mitigated by the dummy hash; verified by a test that compares paths, not wall-clock time.
7. **Service worker caching authenticated data (medium).** Mitigation: the worker caches only static assets; one test asserts API routes are never cached.
8. **TTL lag (low).** Expiry decided in code, never by document disappearance.

Rollback: the feature is additive and has no data migration for other features; revert the commits and drop the three collections.

## Significant decisions to log

- Server-side sessions in MongoDB with an opaque cookie, chosen over stateless tokens so sign-out is real.
- argon2id for passwords (constitution 16 allows argon2 or bcrypt).
- Same-registrable-domain deployment (Option A) recommended; Option B only as a recorded exception.
