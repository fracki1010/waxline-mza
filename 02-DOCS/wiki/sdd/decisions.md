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
