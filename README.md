# waxline-mza

Two independent npm packages, one lockfile each: `backend/` (Express + MongoDB) and `frontend/` (React + Vite).

## Setup

```sh
nvm use                      # Node 24, see .nvmrc
npm --prefix backend install
npm --prefix frontend install
git config core.hooksPath .githooks   # pre-commit: lint, typecheck, tests in both packages
cp .env.example backend/.env
```

## Checks (run in each package)

```sh
npm run lint
npm run typecheck
npm test
```

Backend tests use a real MongoDB in Docker (`mongo:7`, must be pulled already). `npm test` starts it
via `scripts/test-db.sh up` (port 27018); stop it with `bash scripts/test-db.sh down`.
Override with `MONGODB_TEST_URI`.
