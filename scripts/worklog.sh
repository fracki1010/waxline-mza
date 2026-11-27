#!/usr/bin/env bash
# Drafts a worklog checkpoint from git history: commits and files since a date.
# Usage: scripts/worklog.sh <slug> [since]   (since defaults to today, e.g. 2026-11-27)
# Writes 02-DOCS/raw/worklog/<today>-<slug>.md. Outcome and Next stay as placeholders to fill in.
set -euo pipefail

slug="${1:?usage: scripts/worklog.sh <slug> [since]}"
since="${2:-$(date +%F)}"
# A bare date is read as midnight; git ignores a bare date in --since.
case "$since" in ????-??-??) since="$since 00:00" ;; esac
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/02-DOCS/raw/worklog/$(date +%F)-$slug.md"

if [ -e "$out" ]; then
  echo "refusing to overwrite $out" >&2
  exit 1
fi

commits="$(git -C "$root" log --since="$since" --reverse --format='- %h %s')"
files="$(git -C "$root" log --since="$since" --name-only --format= | sort -u | sed '/^$/d; s/^/- /')"

if [ -z "$commits" ]; then
  echo "no commits since $since" >&2
  exit 1
fi

cat > "$out" <<EOF
# Worklog — $slug, $(date +%F)

## What
$commits

## Files
$files

## Outcome
_Fill in: tests run, deploys, decisions taken, incidents._

## Next
_Fill in: open items and owner decisions._
EOF

echo "$out"
