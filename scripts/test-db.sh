#!/usr/bin/env bash
# Manages the throwaway MongoDB container used by backend tests. Never pulls images.
set -euo pipefail
NAME=waxline-test-mongo
case "${1:-}" in
  up)
    # Recreate a container that predates the file-descriptor limit: an existing one cannot be changed in place.
    if docker inspect "$NAME" >/dev/null 2>&1 \
      && ! docker inspect -f '{{json .HostConfig.Ulimits}}' "$NAME" | grep -q nofile; then
      docker rm -f "$NAME" >/dev/null
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
      if docker inspect "$NAME" >/dev/null 2>&1; then
        docker start "$NAME" >/dev/null
      else
        # 1024 (the default soft limit) ran out under parallel test files: "Too many open files".
        docker run --pull never -d --name "$NAME" --ulimit nofile=65536:65536 \
          -p 127.0.0.1:27018:27017 mongo:7 >/dev/null
      fi
    fi
    for _ in $(seq 1 60); do
      if docker exec "$NAME" mongosh --quiet --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then exit 0; fi
      sleep 1
    done
    echo "test-db: timed out waiting for $NAME" >&2
    exit 1
    ;;
  down) docker rm -f "$NAME" >/dev/null 2>&1 || true ;;
  *) echo "usage: test-db.sh up|down" >&2; exit 2 ;;
esac
