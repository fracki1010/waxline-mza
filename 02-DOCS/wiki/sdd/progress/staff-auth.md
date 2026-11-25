# staff-auth — progress ledger

Stage: T001 spike done (owner-reported pass on iPhone), next: T002 repo foundation.

## Decision queue

- [review-after] Q1 — constitution v1.0.0 ratified provisionally, 02-DOCS/wiki/sdd/constitution.md, constitution
- [review-after] Q2 — assumed npm, Vitest and a 70% coverage floor, constitution principles 5 and 8, constitution
- [review-after] Q3 — assumed one repo with backend/ and frontend/ folders, constitution principle 4, constitution
- [review-after] Q4 — assumed Conventional Commits without emoji although rsc emoji is on, constitution principle 11, constitution
- [review-after] Q5 — spec approved in autopilot, not item by item, 02-DOCS/wiki/sdd/specs/staff-auth.md, specify
- [review-after] Q6 — no human-approved reference for the sign-in screen; acceptance criteria used as mechanical reference, spec section "What result they get", specify
- [review-after] Q7 — assumed 14-day session, 5 attempts per 15 minutes lockout, single role, username sign-in, owner-created first account, spec Points to clarify, specify
- [review-after] Q8 — sign-in UI language assumed Spanish (Argentina), spec Points to clarify, clarify
- [review-after] Q9 — lockout counted per username, can lock out a real colleague for 15 minutes, spec Points to clarify, clarify
- [superseded by Q10 below] Q10 (original) — cross-site session spike with a same-domain fallback; replaced when the deployment moved to Hosting + Cloud Run
- [resolved 2026-11-24] Q11 — owner confirmed they own a domain, so Option A is viable. Was: owner must say whether they own a domain (Option A needs one) before spike S0 and tasks, plan section 7 risk 2, plan
- [review-after] Q12 — plan chose server-side sessions in MongoDB and argon2id, plan section 2, plan
- [resolved 2026-11-24] Q10 — cross-site question replaced: one origin via Hosting rewrite; spike S0 is now task 0 and blocks all other implementation tasks, plan section 6, plan
- [partly resolved 2026-11-25] Q13 — Blaze enabled (spike deployed); Atlas cluster still to create before T015/T016. Was: owner must enable Blaze billing and create the Atlas cluster before deployment (step 8) and the spike, plan section 6, plan
- [review-after] Q14 — constitution v1.1.0 struck principles 4 and 18, added 22-25, constitution
- [review-after] Q15 — Atlas allow-list likely open to all addresses because Cloud Run has no fixed egress, plan section 7 risk 3, plan
- [review-after] Q16 — lockout window fixed from first failure; last use measured with one-hour granularity; cookie Max-Age 14 days, spec Points to clarify, analyze
- [review-after] Q17 — analyze found 4 HIGH issues; fixed by adding T018 and T019, route-level tests for AC5/AC7/AC8, cookie Max-Age, CSRF origin check and a spike fallback, plan Tasks, analyze
- [resolved 2026-11-24] Q18 — owner chose one work-unit commit per slice on main (T002; T003-T004; T005-T006; T007-T008; T018; T009-T010; T011; T012; T013-T014; T019; T015; T016-T017). Was: owner must choose how to split the ~2,000-line change into work-unit commits on main before implement (plan Review Workload Forecast), plan, tasks
- [review-after] Q19 — analyze run 2 passed with 8 MEDIUM; F1-F5 and F8 folded into plan and tasks, the rest accepted (F6 HTTPS only manual, F7 axe cannot check 44px or focus under jsdom), analyze
- [note 2026-11-25] T001 spike NOT yet run: the reported fetch failure came from the page opened as a data: URL in the app's browser pane, not from the deployed site. No evidence yet about iOS and `__session`; T001 stays pending, spike page now disables itself outside http(s), spike
- [note 2026-11-25] T001 server side verified with curl on https://waxline-mza.web.app (cookie passes, other cookies stripped); iPhone test still pending, verifications/staff-auth-spike-2026-11-25.md, spike
- [done 2026-11-25] T001 — spike passed on a real iPhone (Safari, installed PWA, close and reopen); 1h and next-day checks repeated in T016, verifications/staff-auth-spike-2026-11-25.md, T001
- [review-after] Q20 — iPhone result is owner-reported, not observed by the agent; spike resources (function api, hosting site) stay deployed until cleanup, T001
- [review-after] Q21 — T002 test DB is Docker mongo:7 instead of in-memory; tests and pre-commit need Docker, decisions.md 2026-11-25, T002

## T002 — 2026-11-25
- status: built, reviewed, awaiting human approval (tier 2) before the commit
- red: backend smoke tests failed on the stubbed harness; after review, the new tests failed for x-powered-by (`expected 'Express' to be undefined`) and for missing `app.locals.deps`
- green: backend 4 tests, frontend 1 test; coverage 100% lines in both (threshold 70% enforced, checked by raising it to 101)
- mutation: removing `express.json()` makes the malformed-JSON test fail
- files: .nvmrc, .env.example, README.md, scripts/test-db.sh, .githooks/pre-commit, root .gitignore (appended), backend/ and frontend/ packages
- risk: tier 2 (secrets class via `.env.example`), computed by `rsc risk` on the real files; panel of 3 (correctness, security, tests) recorded; 10 findings round 1 (7 fixed, 2 intentional, 1 irrelevant); round 2: no findings
- controls: tests ok (both packages), lint ok, typecheck ok, build ok (reported by the implementer, not re-run by me), traceability ok (enabler for AC1-AC9), security scan not run (`npm audit` not executed)
- decision: Docker mongo:7 instead of in-memory (decisions.md), hook path `.githooks`, `.env` rules appended to the root `.gitignore`

## T002 — 2026-11-25 (correction)
- status: complete. Owner approved the tier-2 slice in chat; committed as a143f95 on main; the pre-commit hook ran and passed.
- [review-after] Q22 — T004 security review: T010 must bound password length (1024), reject non-well-formed Unicode, normalize NFKC in one helper used by sign-in and create-staff, cap in-flight verifications at 4 and limit the body to 10 kB; NFKC folds compatibility characters, which is the NIST 800-63B recommendation, plan T009/T010, T004

## T003-T004 — 2026-11-25
- status: built, reviewed (2 rounds), awaiting human approval of the final diff (tier 2)
- red: stub module failed on assertions (5 of 6 failed); later rewrite verified by mutation instead
- green: backend 17 tests passing, hash.ts 100% lines (91% branches), lint and typecheck clean
- mutation: 26 mutants in round 1 (20 survived the first tests); after the rewrite 19 of 20 re-run mutants die and the survivor is equivalent; round 2 reviewer ran 28 mutants, 4 equivalent survivors
- files: backend/src/services/hash.ts, backend/test/hash.test.ts
- risk: tier 2 (auth class, `timingSafeEqual`), panel of 3 recorded; round 1: 8 findings (4 fixed, 2 parked to T010, 2 intentional); round 2: 2 nits (1 fixed, 1 intentional)
- design: Node built-in `crypto.argon2` (no dependency), argon2id m=19456 t=2 p=1, PHC string, parameters read from the stored hash with caps
- controls: tests ok, lint ok, typecheck ok, traceability ok (AC2, AC3), security scan not run (`npm audit` not executed, no new dependency added)
- parked to T010: bound password length, reject non-well-formed Unicode, NFKC helper, cap in-flight verifications, 10 kB body (plan T009/T010, Q22)

## T003-T004 — 2026-11-25 (correction)
- status: complete. Owner approved the final tier-2 diff in chat; committed as b361fe8 on main; the pre-commit hook ran and passed.

## T005-T006 — 2026-11-25
- status: built, reviewed, awaiting owner approval (rsc tier 1; approval requested anyway: brute-force protection)
- red: stub failed 11 of 14 tests on assertions
- green: backend 31 tests; lockout.ts 100% lines, 92% branches overall; lint and typecheck clean
- mutation: implementer 12 of 12 killed; reviewer 22 mutants, survivors only equivalent (missing-type check) or about the removed retry branch; I re-ran the normaliser mutants after extracting it (2 of 2 regressions killed, the NFC addition is not pinned on purpose)
- files: backend/src/services/lockout.ts, backend/src/services/username.ts, backend/test/lockout.test.ts
- risk: tier 1 by `rsc risk` on the real files (plan forecast was 2; the computed tier wins). One fresh all-lens reviewer: 3 nits (dead retry removed, shared normaliser extracted, invalid `now` guard skipped). Round 2 was NOT an independent re-review: the delta was a deletion of a branch proven dead plus moving a one-line function, verified by tests and mutants
- controls: tests ok, lint ok, typecheck ok, traceability ok (AC7), security scan not run (`npm audit` not executed; no new dependency)
- pushed to later tasks: username type and length 1-64 (T009/T010), startup `ensureLockoutIndexes` (T010), T018 reuses `normaliseUsername`

## T005-T006 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed.

## T007-T008 — 2026-11-25
- status: built, reviewed, awaiting owner approval (rsc tier 1; approval requested anyway: session handling)
- red: stub failed 13 of 16 tests on assertions; hardening tests failed 4 on assertions before the guard existed
- green: backend 51 tests; hash, lockout, sessions and clock 100% lines; lint and typecheck clean
- mutation: implementer 25 mutants, all killed; reviewer 28 mutants, 2 survivors (regex anchors) now killed by testing the exported validator; 11 mutants on the new guards, all killed, files restored with cmp
- files: backend/src/services/sessions.ts, backend/src/services/clock.ts, backend/src/services/lockout.ts (clock guard added), backend/test/sessions.test.ts, backend/test/lockout.test.ts
- risk: tier 1 by `rsc risk` on the real files (plan forecast was 2). One fresh all-lens reviewer: 0 blockers, 2 should-fix (invalid now fails open; staffId unchecked), 3 nits. Round 2 was NOT an independent re-review: the delta was a clock guard, a staffId check and an exported validator, verified by 11 mutants
- controls: tests ok, lint ok, typecheck ok, traceability ok (AC5, AC6, AC8), security scan not run (`npm audit` not executed; no new dependency)
- pushed to T010: cookie re-send only when touched, clear on null and on sign-out, id only from cookie, staff record re-check, single injected now (plan T010 row, risk 12)

## T007-T008 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed as 21179d1 on main; the pre-commit hook ran and passed.

## T018 — 2026-11-25
- status: built, reviewed, awaiting owner approval (rsc tier 1)
- red: stub failed 7 of 10 tests on assertions; after review, the new display-name cap test failed 1 of 13 on an assertion before the guard existed
- green: backend 64 tests; staff model 100% lines; lint and typecheck clean
- mutation: implementer 18 mutants, 17 killed, 1 equivalent survivor (explicit username type check: `normaliseUsername(5)` already throws); reviewer fixes: 4 more mutants on the new cap and guard, all killed, file restored with cmp
- files: backend/src/models/staff.ts, backend/test/staff.test.ts
- risk: tier 1 by `rsc risk`. One fresh all-lens reviewer: 0 blockers, 4 should-fix, 9 nits. Fixed: misleading guard comment (reworded), query-never-reached test now spies on `findOne`, concurrent-duplicate test added, display name capped at 100, plan interface updated with `now`. Round 2 was NOT an independent re-review: verified by tests and mutants
- controls: tests ok, lint ok, typecheck ok, traceability ok (AC1-AC3 enabler), security scan not run (`npm audit` not executed; no new dependency)
- pushed to T010: wire `ensureSessionIndexes` and `ensureStaffIndexes` at startup (plan T010 row); username length measured after trimming
- parked, not done: NFC/NFKC and zero-width characters in usernames (look-alike names get separate accounts and lock buckets; staff-only, low impact; a change to `normaliseUsername` would touch the lockout too); `passwordHash` format not checked (caller's job); `instanceof MongoServerError` fails if two copies of `mongodb` load (accepted; the test pins it)

## T018 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed.
