# staff-auth — progress ledger

Stage: tasks written and analyzed (PASS), next: implement T001 (spike), blocked on Q13.

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
- [blocking] Q13 — owner must enable Blaze billing and create the Atlas cluster before deployment (step 8) and the spike, plan section 6, plan
- [review-after] Q14 — constitution v1.1.0 struck principles 4 and 18, added 22-25, constitution
- [review-after] Q15 — Atlas allow-list likely open to all addresses because Cloud Run has no fixed egress, plan section 7 risk 3, plan
- [review-after] Q16 — lockout window fixed from first failure; last use measured with one-hour granularity; cookie Max-Age 14 days, spec Points to clarify, analyze
- [review-after] Q17 — analyze found 4 HIGH issues; fixed by adding T018 and T019, route-level tests for AC5/AC7/AC8, cookie Max-Age, CSRF origin check and a spike fallback, plan Tasks, analyze
- [resolved 2026-11-24] Q18 — owner chose one work-unit commit per slice on main (T002; T003-T004; T005-T006; T007-T008; T018; T009-T010; T011; T012; T013-T014; T019; T015; T016-T017). Was: owner must choose how to split the ~2,000-line change into work-unit commits on main before implement (plan Review Workload Forecast), plan, tasks
- [review-after] Q19 — analyze run 2 passed with 8 MEDIUM; F1-F5 and F8 folded into plan and tasks, the rest accepted (F6 HTTPS only manual, F7 axe cannot check 44px or focus under jsdom), analyze
