# Deployment

The API runs on Cloud Run (`waxline-api`, `us-central1`); the frontend runs on Firebase Hosting, which forwards `/api/**` to the API. The Blaze plan is already enabled.

## First deploy (human steps)

1. Create the Atlas cluster and a dedicated least-privilege database user. Allow Cloud Run's outbound traffic in the Atlas network access list.
2. Create the Secret Manager secret `waxline-mongodb-uri` holding the Atlas connection string, and let the Cloud Run runtime service account read it.
3. Confirm the Hosting origin in `deploy/deploy-api.sh` (`ALLOWED_ORIGINS`).
4. Deploy the API: `bash deploy/deploy-api.sh`.
5. Build and deploy the frontend: `npm --prefix frontend run build`, then `firebase deploy --only hosting --project waxline-mza`.

## Rollback

- API: in Cloud Run, route 100% of traffic back to the previous revision of `waxline-api`.
- Frontend: in Firebase Hosting, roll back to the previous release.
