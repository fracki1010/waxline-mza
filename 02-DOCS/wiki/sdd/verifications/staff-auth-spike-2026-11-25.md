---
type: verification
title: Spike S0 (T001) server-side evidence
timestamp: 2026-11-25T00:57:00Z
topic: sdd
slug: staff-auth
---

# Spike S0 (T001): evidence so far

Deployed 2026-11-25 to project `waxline-mza`: Hosting site plus HTTP function `api` (2nd gen, `us-central1`) behind a rewrite of `/api/**`. Checked with `curl` against `https://waxline-mza.web.app`. **No iPhone result yet, so T001 is not done.**

| Check | Result |
| --- | --- |
| Page served | HTTP 200 |
| `Set-Cookie` through the rewrite | `__session=...; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax` arrives intact, with `Cache-Control: no-store` |
| Request with `__session` and another cookie | the API receives `__session` |
| Request with only another cookie | the API receives no `Cookie` header at all (Hosting strips it), as the Firebase docs say |
| Headers the API sees | `host` is the Cloud Run address, `X-Forwarded-Host: waxline-mza.web.app`, `X-Forwarded-Proto: https`; no `Origin` on a GET |

Implication for `ALLOWED_ORIGINS`: the browser-facing origin is `https://waxline-mza.web.app` (and `https://waxline-mza.firebaseapp.com`); the real `Origin` on POST still has to be observed from a browser.

Pending (owner, real iPhone): Safari, installed PWA, close and reopen, after one hour, next day.

Cleanup note: the deploy warned that Artifact Registry has no cleanup policy, so old function images accumulate and can add a small monthly cost. Not applied; owner's decision (`firebase functions:artifacts:setpolicy`).
