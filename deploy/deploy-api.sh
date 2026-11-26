#!/usr/bin/env bash
# Deploys the API to Cloud Run from backend/ (built by backend/Dockerfile). Run from anywhere.
# Prerequisite: Secret Manager secret `waxline-mongodb-uri` already exists (this script does not create it)
# and the Cloud Run runtime service account can read it.
set -euo pipefail
cd "$(dirname "$0")/.."

# TO BE CONFIRMED BY THE OWNER: the Hosting origin(s) allowed to call the API (comma-separated).
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://waxline-mza.web.app}"

# --concurrency 4: sign-in verification (argon2) is capped at 4 at once per instance, so more
#   concurrent requests per instance only queue behind the cap and answer 429 (plan risk 13).
# --max-instances 2: bounds cost and the total hash load a sign-in flood can cause.
# --min-instances 0: scale to zero, so the first request after idle is slow (cold start); the owner
#   decides cost versus cold start (set 1 to avoid it).
# --allow-unauthenticated: Hosting reaches the service as the public; staff auth is in the app.
gcloud run deploy waxline-api \
  --project waxline-mza \
  --source backend \
  --region us-central1 \
  --concurrency 4 \
  --max-instances 2 \
  --min-instances 0 \
  --ingress all \
  --allow-unauthenticated \
  --set-secrets MONGODB_URI=waxline-mongodb-uri:latest \
  --set-env-vars "^|^ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"
