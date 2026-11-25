---
type: analysis
title: Analysis — Staff sign-in (pre-implementation gate, run 2)
description: Cross-read of constitution v1.1.0, spec, plan and tasks T001-T019 for staff-auth; findings ranked.
tags: [sdd, analysis]
timestamp: 2026-11-25T00:17:14Z
topic: sdd
slug: staff-auth
---

# Analysis — Staff sign-in (run 2, judged from scratch)

Inputs: [constitution v1.1.0](../constitution.md), [spec](../specs/staff-auth.md), [plan + tasks](../plans/staff-auth.md), [progress queue](../progress/staff-auth.md) (context only). AC1-AC9 follow the spec list order.

**GATE: PASS** — CRITICAL 0, HIGH 0, MEDIUM 8, LOW 10. The MEDIUM items should be fixed or consciously accepted before `implement`; none makes the artifacts un-implementable.

## Constitution check (analysis 1)

No CRITICAL breach found. Verified compliant: cookie `__session` (§0, T009, principle 24); CORS disabled and one origin (§0, §2, principles 22, 25); `/api` prefix on every route (§3); one lockfile per package (T002, principle 5); 70% coverage configured (T002, principle 8); installable PWA (T012, T016, principle 20); principles 14-17 (T002, T009, T010, T011). Residual issues are the MEDIUM/LOW items below (principles 9, 19, 24, 25).

## Requirement coverage map

```text
REQ | Spec requirement                  | Plan section            | Task(s)                              | Status
--- | --------------------------------- | ----------------------- | ------------------------------------ | ---------
AC1 | Correct sign-in, home shows name  | §0, §3 signIn, §5 r1    | T018,T009,T010,T011,T013,T014,T019   | covered (home screen unowned, F7)
AC2 | Wrong password, generic message   | §0, §3, §5 r2-3         | T003,T004,T009,T010                  | covered (UI message untested, F1)
AC3 | Unknown user same response        | §0, §3, §5 r2-3, risk 8 | T003,T004,T018,T009,T010             | covered (dummy-hash path test, F14)
AC4 | Signed-out refused, sign-in shown | §0, §3 requireStaff, §5 | T009,T010,T013,T014                  | covered
AC5 | Signed in within 14 days of use   | §0, §3 currentUser, §5  | T001,T007,T008,T009,T010,T012        | AMBIGUOUS (sliding untested, F5)
AC6 | Sign-out ends session on device   | §3 signOut, §5 r6       | T007,T008,T009,T013,T014             | covered (other-device test not in T009 text, F5)
AC7 | Lockout 5 in 15 min               | §0, §4, §5 r7           | T005,T006,T009,T010                  | covered (UI message untested, F1)
AC8 | Expired after 14 days             | §0, §3, §5 r8           | T007,T008,T009,T010                  | covered
AC9 | Refusal shape + HTTPS             | §0, §5 r9, §7 risk 7    | T009,T010,T015,T016                  | AMBIGUOUS (HTTPS manual only, F6)
```

Reverse trace (tasks to spec, constitution or stated enablement): every task row carries a Trace. No task lacks one. Origin check and `no-store` are traced loosely (F13).

## Findings

| # | Severity | Type | Artifact A (loc) | Artifact B (loc) | Conflict | Resolve in |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | MEDIUM | Contradiction | Plan §2 shared/api bullet: "turns any 401 into 'session lost'"; T012 Interfaces: `apiFetch` "throws `SessionLostError` on 401" | T010 Interfaces: `POST /api/auth/sign-in` returns `401 INVALID_CREDENTIALS` | A wrong password at sign-in is a 401, so the wrapper would report "session lost" instead of the AC2 message. T013 has no test for the wrong-password or lockout message in the UI, so nothing catches it. | plan (wrapper rule), tasks (add T013 cases) |
| F2 | MEDIUM | Ambiguity / carrier | Plan §0 (line 23): 403 `FORBIDDEN_ORIGIN` when `Origin` "is not the app's own" | T002 `.env.example`, T010, T015, T012: no config key, no source for the allowed origin | Behind Hosting the API sees the run.app host, not the public host; dev proxy origin differs. No rule for a missing `Origin` header or for dev. A blind implementer can ship an origin check that 403s every real sign-in. | plan (§0 + Interfaces) |
| F3 | MEDIUM | Ambiguity / carrier | Plan §5 last paragraph: real in-memory MongoDB, injectable clock | T002 (smoke test only), T009/T010 Interfaces: no app factory, no clock or DB injection point | T009 is test-first for day 13, day 15 and sixth-attempt route tests but cannot be written without knowing how time and DB reach the app. Harness (mongodb-memory-server) has no owner task. | tasks / plan |
| F4 | MEDIUM | Ambiguity / carrier | T015 (no Interfaces block) | T010, §0 (proxy trust), principle 23 | Env var names (Mongo URI, allowed origin), `PORT`, start command, trust-proxy value and Dockerfile location are unstated. T015 done-check is local only; real proxy behaviour waits for T016. | plan / tasks |
| F5 | MEDIUM | Ambiguity | AC5 "within 14 days of their last use"; plan §3 currentUser (sliding, cookie re-sent) | T007/T008 done-check (day 13 valid, day 15 refused), T009 text, T008 Interfaces `resolve(): {staffId} \| null` | No test proves sliding expiry (use at day 10, still valid at day 20) or that the cookie is re-issued with fresh `Max-Age`; `resolve` cannot tell the route whether it touched the session. Plan §5 row 6 "another device keeps its session" is missing from T009's list. | tasks (done-checks), plan (T008 Interfaces) |
| F6 | MEDIUM | Ambiguity | Spec AC9 "travels over HTTPS"; spec "How it proves it" (one automated test per AC) | Plan §5 row 9 asserts only the `Secure` flag; T009 lists "error shape"; T016 checks HTTPS by hand | HTTPS has no automated check. T009 does not list malformed JSON, unknown route (404) or unhandled error (500) shape, which Express answers in HTML by default. §0 says `Secure` is unconditional, risk 7 implies it depends on proxy trust. | tasks, plan |
| F7 | MEDIUM | Ambiguity / constitution 19 | Principle 19 (focus, 44px targets, "changed UI") | T019 done-check: zero axe violations, sign-in screen only; T014 description omits the home screen | axe under jsdom cannot measure target size or focus visibility; nothing checks them on a device. AC1's home screen (name, sign-out control) is not named in T014 and not audited by T019. | tasks |
| F8 | MEDIUM | Process / blocking queue | Plan Review Workload Forecast: "Decision needed before apply: Yes" (ask-on-risk) | Progress decision queue: no entry for the split-or-exception decision | The apply guard stops on it, and the queue shows no record of it. | user, then log in queue |
| F9 | LOW | Wording | Plan Forecast: "14 of 19 tasks are tier 2 by path" | Task table: 13 tier-2 by path (15 if T011 and T015 "expect 2" are counted) | Count is wrong either way. | tasks |
| F10 | LOW | Constitution 9, 6, 12 | Principle 9 layout (`routes`, `services`, `models`) | Plan §2: `requireStaff` placement, `backend/scripts/create-staff`, app bootstrap and error handler homes; plan §6 spike at `spike/` before the T002 pre-commit hook | Placement outside the three folders is unspecified. If spike files are committed before the hook, principle 6 and 12 are skipped. T015 later also owns `firebase.json`, which the spike needs first. | plan |
| F11 | LOW | Stale reference | Spec "What it must respect" (line 52) cites HTTPS "(principle 18)" | Constitution: 18 struck, superseded by 25 | Points at a struck principle. Spec Clarifications line 95 also says "gate before `tasks`", now "first task". | clarify |
| F12 | LOW | Stale / mismatch | Plan §6 step 7 (phone check on real deploy) before step 8 (deployment config); §5 PWA row "iPhone and Android" | Tasks: T015 before T016; T016 checks iPhone only | Plan order is stale (tasks are right); Android check dropped. | plan |
| F13 | LOW | Trace precision | T009/T010 Trace "constitution 17" | Origin check (plan risk 6), `__session` and `no-store` (principles 24, 25) | Origin check serves no AC and cites no principle; tag it with risk 6 and 24-25, or accept it as plan-level hardening. | tasks |
| F14 | LOW | Coverage of mitigations | Plan §7 risk 3 (least-privilege DB user, TLS), risk 8 (code-path test), "Significant decisions to log" (principle 21) | Tasks: no row owns them | Mitigations without a task will not happen. T009 does not assert the unknown-user path calls the dummy comparison. | tasks |
| F15 | LOW | Duplication | `Max-Age=1209600` (§0, T010) vs `SESSION_DAYS = 14` (T008); `createStaff` in §3 (CLI) vs T018 (model function); §0 "lower-cased" vs T006/T018 "trimmed and lower-cased" | | Same values stated twice; one definition each avoids drift. | plan |
| F16 | LOW | Underspecification | Principle 17 validation; §4 `signInAttempts` | T010: no max length for username or password | Unbounded input means unbounded argon2 work and unbounded attempt documents. | plan |
| F17 | LOW | Underspecification | Principle 20 (installable) | T012: manifest and service worker only | Installability needs icons and `start_url`; no task owns them. T016 would find out late. | tasks |
| F18 | LOW | Ambiguity | Plan §0 "everything except sign-in and health requires a session" | T010: sign-out returns 204 only | Sign-out without a valid session: 401 or 204? Whether the cookie is cleared is unstated. | plan |

## Interfaces carrier check

- §0 Global Constraints exists, with verbatim values.
- Interfaces present: T001, T004, T006, T008, T010, T011, T012, T014, T018. Test-first tasks defer to their implementation task (stated).
- Missing or thin: T015 (F4), the T010 app and clock injection (F3), T008 touch signal (F5), allowed-origin source (F2). T002, T016, T017, T019 are consumers or checks; acceptable.

## Ordering against the blocking queue

Q13 (blocking) is carried by T001's Depends-on; every other task depends on T001 directly or transitively (T002 on T001; T003, T005, T007, T012, T018 on T002; the rest follow). T015 and T016 (deployment) are reached through the same chain. T001 does not need Atlas for the spike itself, so Q13 over-blocks slightly; acceptable as written. Dependencies are acyclic; T009 correctly waits for T018. No ordering defect.

## Recommended routing

- `plan`: F1 (wrapper rule), F2, F3 (app factory and clock), F4, F5 (T008 touch signal), F6, F10, F12, F15, F16, F18.
- `tasks`: F1 (add UI message cases to T013), F3, F5 (done-checks), F6, F7, F9, F13, F14, F17.
- `clarify`: F11.
- user decision: F8 (chained commits or `size:exception`), then log it.
- If left unfixed, the likely cost is at implement time: F1 and F2 produce a sign-in that fails on the real deploy while local tests pass; F3 stalls the first route test.

```json result-envelope
{
  "status": "complete",
  "executive_summary": "GATE: PASS, 0 CRITICAL, 0 HIGH, 8 MEDIUM, 10 LOW. No constitution breach; AC1-AC9 all traced to plan and tasks.",
  "artifact": "02-DOCS/wiki/sdd/analysis/staff-auth.md",
  "next_recommended": "implement",
  "risk": "medium",
  "skill_resolution": {"used": ["analyze"], "missing": [], "fallback": [], "compact_rules": []},
  "evidence": ["report path exists", "findings carry artifact and location"]
}
```
