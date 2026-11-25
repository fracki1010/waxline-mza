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
