# Spike S0 (T001), throwaway

Question: does an installed iOS PWA keep the `__session` cookie after being closed and reopened, when the API sits behind a Firebase Hosting rewrite to Cloud Run?

Delete this folder after the result is recorded in `02-DOCS/wiki/sdd/verifications/`.

## Deploy (needs the Blaze plan on project `waxline-mza`)

The API runs as a Firebase function (HTTP, 2nd gen, which Firebase runs on Cloud Run) behind a Hosting rewrite of `/api/**`. The production container on Cloud Run is validated later, in T015.

```bash
cd spike
firebase deploy --only hosting,functions --project waxline-mza --account fracki1010@gmail.com
```

## Phone test (real iPhone)

1. Open `https://waxline-mza.web.app` in Safari. Tap "1. Set cookie", then "2. Read cookie". Expect `cookieReceived` to equal the value set.
2. Share, then "Add to Home Screen". Open the installed app from the home screen.
3. In the installed app tap "1. Set cookie" (Safari and the installed app can keep separate cookies), then "2. Read cookie".
4. Close the installed app fully (swipe it away), reopen it, tap "2. Read cookie". Expect the same value.
5. Repeat step 4 after waiting an hour, and again the next day.
6. Copy the `origin`, `host` and `xForwardedHost` values from the last response; they set `ALLOWED_ORIGINS` later.

Report back: pass or fail for steps 1, 3, 4 and 5, and the header values.
