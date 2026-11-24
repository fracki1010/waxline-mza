# REVIEW.md — how this repo is judged

## What failure looks like here

- A route reachable without an authenticated staff session (except login and health).
- A Mongo query built from unvalidated request input (operator injection).
- A password, token or secret in code, logs, responses or git history.
- Two appointments overlapping the same slot because the check is not atomic or not backed by a unique index.
- Server data copied into a Zustand store instead of read from TanStack Query.
- CORS opened to `*` or the API reachable over plain HTTP.

## Paths to skip

- `node_modules/`, `dist/`, `build/`, `coverage/`, lockfiles, `.rsc/`, `.claude/skills/`.

## Nit cap

- At most 3 nits per review; drop the rest.

## Always-human paths

- Anything under `backend/src/**/auth*`, session or password handling.
- Deployment config (Firebase, server/CI files) and any `.env*` handling.
- Mongo schema or index changes.

## Summary format

Start with a count: "3 findings: 1 blocker, 2 nits".
