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

## T009-T010 — 2026-11-25
- status: built, reviewed (panel of 3, round 1 fixed), awaiting human approval of the final diff (tier 2)
- red: stub failed 62 of 129 tests on assertions; after the panel, 11 route tests failed on assertions and 18 lockout and config tests failed on missing functions before the fixes
- green: backend 158 tests, 7 consecutive full runs green in my own check; 100% line coverage with `server.ts` excluded (entry point, covered by T016); lint, typecheck and build clean
- mutation: writer 62 mutants (3 equivalent survivors) plus 38 on the post-review code (1 equivalent survivor: the `doc !== null` fail-closed guard in `reserve`); tests reviewer 78 mutants, 10 survivors that became tests
- files: backend/src/{app,config,indexes,server}.ts, middleware/*, routes/*, services/{lockout,password-input}.ts, models/staff.ts (findById), tsconfig.json (lib ES2024), vitest.config.ts, .env.example, and their tests
- risk: tier 2 (auth class) by `rsc risk`; panel of 3 recorded (correctness, security, tests); ledger L29-L38: 8 fixed, 2 parked (L30 cap abuse accepted as plan risk 13; L38 normalisation for T011). Round 2 was NOT an independent re-review: the fixes were verified by tests, 38 mutants and my own read of the sign-in route
- controls: tests ok, lint ok, typecheck ok, build ok, traceability ok (AC1-AC9), security scan not run (`npm audit` not executed; no new dependency)
- open: one full-suite run failed a single test once for the writer and could not be reproduced in 32 further runs and 7 of mine; cause unidentified, probably a cold-start timeout
- not verified: `server.ts` never started (T016 real-URL pass); Hosting forwarding of `Origin` and the cookie, and whether the `*.run.app` URL is reachable directly (ingress should be restricted in T015)

## T009-T010 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed on main (a01c769); the pre-commit hook ran and passed.

## T011 — 2026-11-25
- status: built, reviewed, awaiting owner approval (tier 1 by `rsc risk`; plan expected 2 for password handling, so I ask anyway)
- red: new test file failed to import the missing module (1 file failed, 158 existing passed); green: backend 173 tests, 3 consecutive full runs green; lint, typecheck and build clean; 100% lines
- mutation: writer 10 killed mutants (min length 9/10/11, `<` vs `<=`, normalise removed, ensure-index removed, raw password hashed, exit code, arg parsing, error echo); 1 no-op placeholder discarded
- files: backend/src/scripts/{create-staff,create-staff-cli}.ts, backend/test/create-staff.test.ts, backend/package.json (script), backend/vitest.config.ts (CLI excluded from coverage)
- risk: one fresh reviewer (risk lens): 0 blockers, 3 should-fix, several nits. Fixed: single readline with `historySize: 0`, Ctrl-C and Ctrl-D end with "Cancelled" and exit 1 (observed in a pty). Not fixed: CLI has no automated test (checked by hand in a pty: success exit 0, mismatch exit 1, short password exit 1, non-TTY exit 1, Ctrl-C and Ctrl-D exit 1, secret never in output); npm script rebuilds the backend and needs `tsc` (decision for T015). Round 2 was NOT an independent re-review
- controls: tests ok, lint ok, typecheck ok, build ok, traceability ok (AC1 enabler), npm arg forwarding checked by me, security scan not run (`npm audit` not executed; no new dependency)
- not verified: Windows; a real terminal emulator beyond the pty; the script against Atlas

## T011 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed.

## T012 — 2026-11-25
- status: built, reviewed, awaiting owner approval (tier 1 by `rsc risk`)
- red: tests written first; red shown by hiding the implementation (api and messages missing, sw.js missing); green: frontend 52 tests, 3 consecutive full runs green, 100% lines and branches; lint, typecheck and build clean; `dist/` has manifest, `sw.js` with injected cache name and precache list, icons
- mutation: 11 hand mutants on the worker and `apiFetch`, all killed (api guard, regex, method guard, ok/basic/html checks, fallback, 401, `..`, `no-store`, `clients.claim`)
- files: frontend/{index.html,vite.config.ts,swInject.ts}, frontend/public/{sw.js,manifest.webmanifest,icons/*}, frontend/src/{main.tsx,pwa.test.ts,swInject.test.ts}, frontend/src/shared/{api,messages,api.test}.ts
- risk: tier 1. One fresh reviewer: 0 blockers, 5 should-fix. Fixed: HTML cached as a hashed asset, offline shell without assets and a never-changing cache name (now build-injected), `/index.html` redirect risk (precache `/` only), weak worker tests (offline fallback, install, activate, never-cache-a-navigation), `apiFetch` hardening (`..`, backslash, `no-store`, JSON type only for strings). Plan interface updated to the real `apiFetch` signature and to the `/me` 401 handling T014 needs. Round 2 was NOT an independent re-review: verified by tests, 11 mutants and my own run
- controls: tests ok, lint ok, typecheck ok, build ok, traceability ok (AC5 and constitution 20 enabler), security scan not run (`npm audit` not executed; no new dependency)
- not verified: real browser install, offline launch and update flow, and Hosting `cleanUrls` behaviour (T016 on the real URL); the dev proxy against a running backend; iOS

## T012 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed.

## T013-T014 — 2026-11-25
- status: built, reviewed (panel of 3, round 1 fixed), awaiting human approval of the final diff (tier 2)
- red: T013 tests failed at import (feature missing); after the panel, 21 of 42 auth tests and 1 of 14 api tests failed on assertions before the fixes
- green: frontend 96 tests, 5 consecutive full runs green in my own check; 100% lines (99% statements, 98.7% branches); lint, typecheck and build clean; `npm audit --omit=dev` 0 vulnerabilities
- dependency: `@tanstack/react-query` 5.107.1 pinned exactly (writer reports published 2026-11-06; I verified only npm's last-modified date, 2026-11-23)
- mutation: writer 8 mutants before the panel (1 equivalent survivor: `/me` rethrowing `SessionLostError`) and 20 after it, all killed; 3 survivors were weak tests and were strengthened
- files: frontend/src/{App,App.test,main}.tsx, index.css, features/auth/*, features/home/Home.tsx, shared/{api,api.test,messages,queryClient}.ts, package.json, package-lock.json
- risk: tier 2 (auth class) by `rsc risk`; panel of 3 (security, correctness and tests, resilience), read-only. 0 findings from security, 3 blockers across the others: a failed background refetch replaced the app with the error screen (3 of 3), a stale `/me` could overwrite a newer sign-in or sign-out (2 of 3), sign-out hid that the server session may still be alive; plus no request timeout. All fixed with tests, along with 6 should-fix. Parked: focus management, `aria-describedby`, landmarks, offline banner (T019); `sessionExpired` unused; failed password in mutation variables. Round 2 was NOT an independent re-review: verified by tests, 20 mutants and my own runs
- controls: tests ok, lint ok, typecheck ok, build ok, traceability ok (AC1, AC2, AC4, AC6), audit ok
- not verified: real browser (bfcache, focus events, password managers), real backend run and the dev proxy, the real 15 s timeout (jsdom ignores fake timers for it; tested through a spy), axe (T019)

## T013-T014 — 2026-11-25 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed.

## T019 — 2026-11-26
- status: built, reviewed (panel of 3, round 1 fixed), awaiting human approval of the final diff (`rsc risk` gave tier 2: the files are in the auth class, the plan expected 1)
- red: new tests failed before the implementation (7 offline and banner failures plus 3 stylesheet checks in a focused run; after the first pass 3 still failed and exposed the same-tick sign-out bug)
- green: frontend 143 tests, 5 consecutive full runs green in my own check; 100% lines (99.5% statements, 99.2% branches); lint, typecheck and build clean; `npm audit` (dev included) 0 vulnerabilities
- dependency: `axe-core` 4.14.0 pinned exactly, dev only (writer reports published 2026-10-05; not checked by me)
- mutation: 18 hand mutants on the new logic, 17 killed, 1 equivalent survivor (`setRecovered(!offline)` vs `true`)
- files: frontend/src/features/auth/{OfflineBanner,RequireStaff,SignIn,a11y.test,auth.test}.tsx, features/home/Home.tsx, shared/{useScreenFocus,queryClient,messages}.ts, index.css, package.json, package-lock.json
- risk: tier 2; panel of 3 (auth regression, accessibility and offline UX, tests), read-only: 0 blockers. Fixed: banner shown on any error (now offline or `NetworkError` only), focus lost on the first-load error screen and stolen by the loading screen on cold start, no pending state for `aria-disabled` buttons, a CSS check that passed on `outline: none`, axe never shown able to fail, missing states and landmark checks, test cleanup. Two real bugs found by red tests: mutations paused while offline, and a double click on Salir sending two sign-outs. Parked: single announcement for alert plus focus move, automatic sign-out retry, `h1:focus`, forced-colors and dark mode. Round 2 was NOT an independent re-review: verified by tests, 18 mutants and my own runs
- controls: tests ok, lint ok, typecheck ok, build ok, a11y ok in jsdom (zero axe violations except `color-contrast`, disabled), traceability ok (constitution 19 and 20), audit ok
- not verified: real screen reader, measured contrast, real devices and browsers (44 px targets, focus ring, iOS keyboard, real offline events); real cold start offline outside jsdom

## T019 — 2026-11-26 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed.

## T015 — 2026-11-26
- status: built, awaiting owner approval (tier 1 by `rsc risk`; classes default and docs)
- red: deploy-config test written first (asserts rewrite order, public dir, no-cache headers, project id, non-root user, no secret-looking keys, dockerignore)
- green: backend 179 tests (10 files), lint and typecheck clean; `docker build` of backend/ succeeds; container run on local Mongo gives `GET /api/health` 200, runs as uid 1000 (`node`); grep for secret-looking values in the new files finds nothing
- lockfile: the image's npm rejected the committed lock; regenerated with npm 11.19.1. Diff reviewed by me: adds two optional beta entries and `peer` flags, no version change
- files: backend/{Dockerfile,.dockerignore,package-lock.json,test/deploy-config.test.ts}, firebase.json, .firebaserc, deploy/{deploy-api.sh,README.md}
- not verified: real Atlas, gcloud, `firebase deploy`, the `/api/**` rewrite on a live Hosting URL (T016), the deploy script itself, Secret Manager secret and IAM
- open for the owner: concurrency 4, max-instances 2, min-instances 0, the Hosting origin in ALLOWED_ORIGINS, region us-central1 against the Atlas region

## T015 — 2026-11-26 (correction)
- status: complete. Owner approved in chat; committed on main; the pre-commit hook ran and passed. The defaults (concurrency 4, max-instances 2, min-instances 0, the Hosting origin placeholder, us-central1) were not re-confirmed item by item; they stay editable in deploy/deploy-api.sh before T016.

## T016 — 2026-11-26 (partial)
- status: deployed; production checks PASS for AC1, AC2, AC3, AC4 (partly), AC7, AC9 (partly); AC5 partial (owner reports it works on iPhone; timing not recorded); AC6 and AC8 not run. Record: 02-DOCS/wiki/sdd/verifications/staff-auth-2026-11-26.md
- deployed: Cloud Run revision waxline-api (secret version 6, Atlas network access 0.0.0.0/0 per plan risk 3), Hosting release at waxline-mza.web.app
- owner actions done: Atlas cluster, Atlas DB user with a new password (the one pasted in chat was rotated), secret waxline-mongodb-uri, Atlas Network Access, account `franco` created with the create-staff method (deleted once and recreated)
- not verified: AC6 and AC8, AC5 beyond the same day, offline launch of the installed app

## T017 — 2026-11-26 (closure, partial)
- status: closed with open verification. Spec gate PASS (structural). AC5, AC6 and AC8 are open and recorded in verifications/staff-auth-2026-11-26.md; the feature is not fully verified until they are.
