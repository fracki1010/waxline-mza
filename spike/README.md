# Spike S0 (T001), throwaway

Question: does an installed iOS PWA keep the `__session` cookie after being closed and reopened, when the API sits behind a Firebase Hosting rewrite to Cloud Run?

Delete this folder after the result is recorded in `02-DOCS/wiki/sdd/verifications/`.

## Owner steps (the agent does not run these)

Prerequisites: Blaze billing on the Firebase project `waxline-mza`, `gcloud` and `firebase` logged in with your account.

```bash
# 1. Deploy the API container to Cloud Run (from the spike/ folder)
gcloud run deploy spike-api --source . --region us-central1 --allow-unauthenticated --project waxline-mza

# 2. Deploy Hosting with the /api/** rewrite
npx firebase-tools deploy --only hosting --project waxline-mza
```

## Phone test (real iPhone)

1. Open `https://waxline-mza.web.app` in Safari. Tap "1. Set cookie", then "2. Read cookie". Expect `cookieReceived` to equal the value set.
2. Share, then "Add to Home Screen". Open the installed app from the home screen.
3. In the installed app tap "1. Set cookie" (Safari and the installed app can keep separate cookies), then "2. Read cookie".
4. Close the installed app fully (swipe it away), reopen it, tap "2. Read cookie". Expect the same value.
5. Repeat step 4 after waiting an hour, and again the next day.
6. Copy the `origin`, `host` and `xForwardedHost` values from the last response; they set `ALLOWED_ORIGINS` later.

Report back: pass or fail for steps 1, 3, 4 and 5, and the header values.
