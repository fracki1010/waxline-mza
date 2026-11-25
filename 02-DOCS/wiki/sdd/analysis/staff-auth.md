---
type: analysis
title: Analysis — Staff sign-in
description: Pre-implementation consistency gate for staff-auth, cross-reading constitution v1.1.0, spec, plan and tasks.
tags: [sdd, analyze]
timestamp: 2026-11-24T00:00:00Z
topic: sdd
slug: staff-auth
---

# Analysis — Staff sign-in

Inputs: [constitution v1.1.0](../constitution.md), [spec](../specs/staff-auth.md), [plan + tasks](../plans/staff-auth.md), [decision queue](../progress/staff-auth.md) (context only). Report only; nothing was edited.

**GATE: BLOCKED** — CRITICAL 0 · HIGH 4 · MEDIUM 8 · LOW 3 (15 findings).

## Coverage map (spec AC1-AC9)

| AC | Spec requirement (short) | Plan section | Task(s) | Status |
| --- | --- | --- | --- | --- |
| AC1 | Correct sign-in shows name | §3 signIn, §4 flow, §5 row 1 | T009, T010, T011 (enabler), T013, T014, T016 | covered (but see F2: staff lookup has no task) |
| AC2 | Wrong password refused, generic | §0, §3, §5 rows 2-3 | T003, T004, T009, T010 | covered |
| AC3 | Unknown user indistinguishable | §0, §3 (dummy hash), §5 rows 2-3 | T003, T004, T009, T010 | covered |
| AC4 | Signed-out access refused, sign-in screen shown | §3 requireStaff, §5 row 4 | T009, T010, T013, T014 | covered |
| AC5 | Still signed in within 14 days | §0, §3 currentUser, §4, §5 row 5 | T001, T007, T008, T012 (enabler) | **GAP at route level, and contradicted by the cookie definition (F1, F3)** |
| AC6 | Sign-out ends that session only | §3 signOut, §5 row 6 | T007, T008, T009, T010, T013, T014 | covered |
| AC7 | Lockout 5 in 15 min, "try later" | §0, §3, §4 signInAttempts, §5 row 7 | T005, T006 | **GAP: no route-level task (F3)** |
| AC8 | Session unused > 14 days expires | §0, §5 row 8 | T007, T008 | **GAP: no route-level task (F3)** |
| AC9 | Refusals use error shape, over HTTPS | §0, §5 row 9 | T009, T010, T015, T016 | covered |

Backward (task or plan item with no criterion):

| Item | Traces to | Status |
| --- | --- | --- |
| T002 repo foundation | AC1-AC9 (enabler) | ok, names the criteria |
| T011 first-account script | AC1 (enabler) | ok |
| T012 frontend shell and service worker | "AC5 (enabler)" | weak: its real driver is constitution 20 (installable PWA). Acceptable, but see F4 |
| Plan §7 risk 6 CSRF origin check | none | plan commitment with no task (F6) |
| Staff model/store (plan §4, §6 step 2) | AC1-AC3 | needed, but no task exists (F2) |

## Findings

| # | Severity | Type | Artifact A (loc) | Artifact B (loc) | Conflict | Resolve in |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | HIGH | Contradiction | Spec AC5 + Goals ("stays signed in on phone or desktop", "close and reopen") | Plan §0 session cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Max-Age`/`Expires`; T009 done-check "cookie ... with flags" | A cookie with no lifetime is a browser-session cookie. Desktop browsers drop it on close, so AC5 fails for desktop users, and installed-PWA behaviour is left to chance (the S0 spike tests exactly this, but the plan fixes no lifetime to test). A sliding 14-day session also needs the cookie re-issued on touch. Why it matters: the headline goal can fail while every server-side test is green. | plan (cookie lifetime and re-issue rule), then tasks (done-check) |
| F2 | HIGH | Gap / carrier | Plan §4 `staff` collection, §6 step 2 "staff model"; §3 `currentUser` returns `{id, displayName}` | Tasks: no task builds the staff model or lookup. T010 Interfaces consumes only T004/T006/T008; T008 `resolve` returns `{staffId}` only; T011 "stores a hash" assumes a store exists | The staff store (unique lower-cased username, find by username, find by id for displayName) is silently absorbed into T009/T010/T011 with no done-check and no Interfaces block. Isolated workers will each invent it. | tasks (add a staff store test/impl pair, with Interfaces) |
| F3 | HIGH | Coverage gap | Spec "How it proves it" (integration test per criterion); Plan §5 rows 5, 7, 8 (integration, injectable clock) | T009 Trace `AC1-AC4, AC6, AC9`, T010 same; no task traces AC5, AC7, AC8 beyond the unit-level T005-T008 | Lockout wiring into sign-in (check first, record failure, clear on success, 429 `LOCKED`), the day-13/day-15 `/auth/me` behaviour and the sliding touch in `requireStaff` have no route-level test and no task that builds them. T009's test list does not mention lockout, 429 or expiry. T016 only records a manual line per AC. | tasks (extend T009/T010 trace and test list) |
| F4 | HIGH | Constitution compliance (omission) | Constitution 19 (WCAG 2.2 AA, labelled controls, focus, 44px), 20 (installable PWA, "clear error offline"), Definition of Done lines 8-9 | Plan §2 mentions only manifest + worker; T012-T014 done-checks cover build, `/api` not cached, and behaviour only | No task or done-check carries accessibility or the offline error. The sign-in screen is the only UI, so the floor lands entirely here; verify at closing cannot go green on the DoD as tasks stand. Manifest validity/installability is not checked either. | tasks (add done-checks to T012-T014); plan §5 (a11y/offline rows) |
| F5 | MEDIUM | Underspecified | Constitution 10, 17 (validate every body/query/param; no raw objects into Mongo) | Plan §0 error codes: only `INVALID_CREDENTIALS`, `LOCKED`, `UNAUTHENTICATED`; T009 test list has no malformed-body or `{"$gt": ""}` case | No error code or status for an invalid request body, and no test for NoSQL operator injection on username/password. | plan §0 (add a validation code), tasks (T009) |
| F6 | MEDIUM | Gap (plan to tasks) | Plan §7 risk 6: "origin check on state-changing routes", JSON-only bodies | No task implements or tests it | A named security mitigation will not ship. `SameSite=Lax` covers part of it; the origin check and a JSON content-type enforcement need an owner. | tasks (or drop from plan) |
| F7 | MEDIUM | Carrier completeness | `../tasks` Per-task Interfaces rule; analyze isolated-implementer check | Interfaces exist for T001, T004, T006, T008, T010, T014 only. Missing: T003, T005, T007, T009, T013 (tests-first tasks whose worker never sees the implementation task's signatures, e.g. T009 needs the T010 HTTP contract), T011 (needs hash + staff store signatures), T014 does not consume T012's fetch wrapper or messages module, T012 has no Produces | A blind worker writing T009 or T013 sees only its own row. Section 0 exists and is good; the per-task carriers do not. | tasks |
| F8 | MEDIUM | Contradiction + underspecified | Constitution 5 ("one committed lockfile per package"), 1 (`engines` + `.nvmrc`), 8 (coverage ≥ 70%), 12 (pre-commit gate of 6-8) | Task done-checks use `npm test -w backend` / `-w frontend` (npm workspaces imply a root package and one root lockfile); T002 lists no `.nvmrc`, `engines`, coverage threshold, pre-commit hook or in-memory MongoDB harness (plan §5) | Workspaces and per-package lockfiles pull in opposite directions; four constitutional tooling rules and the Mongo test harness have no home in T002. | plan/tasks (pick one layout, widen T002); constitution only if workspaces are wanted |
| F9 | MEDIUM | Constitution compliance | Constitution 9: `backend/src/{routes,services,models}` | Plan §2 modules `backend/auth`, `backend/lockout`, `backend/staff`; no task names file paths | The plan's module names do not map onto the mandated layout. | plan §2 |
| F10 | MEDIUM | Ordering / ambiguity | Queue Q13 `[blocking]` (Blaze + Atlas before spike and step 8); spec line 81 "spike first, blocks every implementation task" | T001 `Depends-on: —`, Q13 appears only in T001's Interfaces prose; T015/T016 do not list it; plan has no branch if S0 fails (spec Clarifications line 94 promised "a stated fallback") | Q10 is correctly folded into T001 and T002 depends on T001, so everything is blocked transitively, which is intended. But the human prerequisite is invisible to anyone reading the Depends-on column, and a failed spike leaves T002-T017 with no defined path. | tasks (record Q13 as a precondition on T001 and T016), plan §7 risk 2 (fallback) |
| F11 | MEDIUM | Gap | Constitution 25 (CORS disabled, same origin), plan §0 | T012 builds a same-origin fetch wrapper; no task adds a Vite dev proxy for `/api` or a local run instruction | In local development the Vite server and the API are different origins; with CORS off, the frontend cannot call the API, which invites someone to enable CORS. | tasks (T012 or T015) |
| F12 | MEDIUM | Duplication / stale record | Progress ledger line 16 `[blocking] Q10` (cross-site, same registrable domain fallback, "before tasks") | Ledger line 19 `[resolved] Q10` (one origin, spike is task 0); header line 3 "next: plan" | Same ID twice, one still blocking, with a fallback (Option A) the plan has since dropped. A reader or tool counting blockers sees an extra one. | whoever owns the ledger (harness/progress), not a phase artifact |
| F13 | LOW | Stale references | Plan header "Constitution: v1.0.0"; plan §1 "constitution 14-18"; spec "What it must respect" "(principle 18)"; spec Problem "front end and server are separate"; spec Clarifications line 94 "gate before `tasks`" | Constitution v1.1.0: 18 struck (now 25), single origin, spike is task 0 | Wording drift after the v1.1.0 amendment. No behavioural conflict. | plan / clarify |
| F14 | LOW | Ambiguity | Spec AC5 "within 14 days of last use", AC7 "until the window passes" | Plan §3: touch only when older than 1 hour; §4 `windowStart` fixed window; T006 trims and lower-cases, staff lookup unspecified | Effective expiry can be up to 1 hour early versus true last use; fixed vs sliding lockout window and whether failures during lockout extend it are not stated; username normalisation must also apply to the staff lookup. | clarify (numbers), plan |
| F15 | LOW | Minor | T010 done-check "any other route returns 401" (no other route exists yet); sign-out cookie-clearing unspecified; T015 SPA fallback rewrite must come after `/api/**`; T001 absent from the work-unit commit list; "Decision needed before apply: Yes" (delivery strategy) has no queue entry | | Small precision gaps. | tasks |

## Constitution check summary (v1.1.0)

- Cookie `__session`, `no-store`, CORS disabled, same origin, `/api/**` prefix: consistent in plan §0, §2, §3, T009, T010, T015. Struck 4 and 18 are not relied on by tasks; only prose references remain (F13).
- Principle 3 (TanStack Query, no Zustand): respected (plan §1, T014).
- Principles 15, 16, 22-24: respected. Principles 1, 5, 8, 9, 12 (F8, F9), 17 (F5), 19, 20 (F4): not carried by tasks.
- Spec vs plan values: session 14 days sliding, lockout 5/15 min per lower-cased username, 401 `INVALID_CREDENTIALS`, 429 `LOCKED`, 401 `UNAUTHENTICATED` agree, except the cookie lifetime (F1). The spec fixes no codes, so none can conflict.

## Recommended routing

- **plan**: F1 (cookie lifetime and re-issue), F5 (validation code), F9 (module paths), F10 (spike fallback), F13.
- **tasks**: F2 (staff store pair), F3 (route-level AC5/AC7/AC8), F4 (a11y/offline/PWA done-checks), F6, F7 (Interfaces carriers), F8 (T002 scope), F10 (Q13 precondition), F11, F15.
- **clarify**: F14 (window semantics, touch granularity).
- **progress ledger owner**: F12.
- No constitution amendment needed, unless the owner wants npm workspaces (F8).

Findings are spread across plan and tasks but not across all six checks, so this is a targeted rework (plan, then tasks), not a re-run of clarify. Re-run `analyze` afterwards.

```json result-envelope
{
  "status": "complete",
  "executive_summary": "Gate blocked: 4 HIGH (cookie has no lifetime vs AC5, no staff store task, AC5/AC7/AC8 not traced to route-level tasks, a11y/offline floor uncarried), 8 MEDIUM, 3 LOW.",
  "artifact": "02-DOCS/wiki/sdd/analysis/staff-auth.md",
  "next_recommended": "plan",
  "risk": "medium",
  "skill_resolution": { "used": ["analyze"], "missing": [], "fallback": [], "compact_rules": ["Report only.", "A finding without a location is an opinion."] },
  "evidence": ["report path exists", "coverage map AC1-AC9", "constitution v1.1.0 checked"]
}
```
