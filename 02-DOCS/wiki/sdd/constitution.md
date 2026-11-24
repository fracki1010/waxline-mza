---
type: constitution
title: waxline-mza — Constitution
description: The non-negotiable principles every rsc-sdd phase obeys.
tags: [sdd, constitution]
timestamp: 2026-11-24T00:00:00Z
topic: sdd
version: v1.1.0
status: provisional
---

# waxline-mza — Constitution

> Version: v1.1.0 (provisional) · Ratified: 2026-11-24 · Last amended: 2026-11-24
> Car-wash SaaS (appointments, stock, data entry) delivered as a web app and an installable PWA.
> Ratified provisionally in autopilot; the human confirms via the `review-after` entries in
> `02-DOCS/wiki/sdd/progress/staff-auth.md`.

## 1. Stack canon

1. Language and runtime: TypeScript (strict) on Node.js LTS, pinned in `engines` and `.nvmrc`.
2. Backend: Express + MongoDB. Frontend: React + Vite. Changing any of these is a MAJOR amendment.
3. Frontend state: server data lives only in TanStack Query; Zustand holds client/UI state only. No
   server entity is copied into a Zustand store.
~~4. Two independent deployables in one repo: `backend/` (own server) and `frontend/` (Firebase Hosting).~~ (superseded by 22)
5. Package manager: npm, one committed lockfile per package.

## 2. Quality bar

6. ESLint and Prettier pass with zero warnings before every commit.
7. `tsc --noEmit` passes with `strict: true` in both packages.
8. New logic ships with a test (Vitest). Changed code has line coverage ≥ 70%.

## 3. Conventions

9. Layout: `backend/src/{routes,services,models}`, `frontend/src/{features,shared}`; one folder per feature.
10. API errors use one JSON shape: `{ "error": { "code": string, "message": string } }` with correct HTTP status.
11. Commit messages follow Conventional Commits (`feat(auth): ...`), no emoji prefix.

## 4. Branching & shipping

12. Code goes straight to `main` (decision recorded at install). A pre-commit run of principles 6-8 is the gate.
13. **Git authorship is the human's.** No `Co-Authored-By` an AI, no "generated with" footer. Enforced at `ship`.

## 5. Security & privacy floor

14. No secret is committed. Secrets load from environment variables; `.env*` is gitignored and a
    `.env.example` documents each key.
15. Every API route except login and health requires an authenticated staff session.
16. Passwords are stored only as a salted slow hash (argon2 or bcrypt); never logged or returned.
17. Every request body, query and param is validated at the route boundary (schema validation);
    Mongo queries never receive raw user objects (NoSQL operator injection).
~~18. CORS allows only the configured frontend origin; the API is served over HTTPS only.~~ (superseded by 25)

## 6. UX / accessibility floor

19. WCAG 2.2 AA minimum: keyboard-navigable, visible focus, labelled form controls, touch targets ≥ 44px.
20. The PWA is installable (valid manifest + service worker) and degrades to a clear error offline.

## 7. Knowledge & decisions

21. Every significant decision is appended to `02-DOCS/wiki/sdd/decisions.md` (date, options, why).

## 8. Amendments in force (v1.1.0)

22. Two independent deployables in one repo: `backend/` (a container on Cloud Run) and `frontend/` (Firebase Hosting). Hosting serves the front end and forwards `/api/**` to the container, so the browser sees one origin. `frontend/` never imports from `backend/` source. Supersedes 4.
23. MongoDB runs on Atlas; its connection string and every secret load from a secret store or environment, never from the repo.
24. Hosting forwards only the cookie named `__session` to the API, so the session cookie is named `__session` and no other cookie is relied upon. Auth responses are never cacheable (`Cache-Control: no-store`).
25. CORS is disabled (same origin); the API is reachable only over HTTPS. Supersedes 18.

## Definition of Done (the merge bar `verify` runs against)

- [ ] ESLint + Prettier clean; `tsc --noEmit` clean in both packages (6, 7).
- [ ] Tests pass; coverage ≥ 70% on changed code (8).
- [ ] Layout, error shape and commit format followed (9-11).
- [ ] Authored by the human, no AI trailer (13).
- [ ] No secret committed; routes authenticated, input validated (14-17), same-origin only and `__session` cookie (22-25).
- [ ] Accessibility floor met on changed UI (19-20).
- [ ] Significant decisions logged (21).

## Amendment log (append-only)

| Date | Version | Change | Why |
| --- | --- | --- | --- |
| 2026-11-24 | v1.0.0 | Ratified initial constitution (provisional, autopilot). | Project kickoff; first feature is staff login. |
| 2026-11-24 | v1.1.0 | Struck 4 and 18; added 22-25 (Cloud Run behind Hosting, Atlas, `__session` cookie, no CORS). | Owner chose to host everything on Firebase; verified in Firebase docs that Hosting forwards only `__session` to the backend. |
