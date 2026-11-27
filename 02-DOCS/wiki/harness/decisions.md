# Harness decisions

- Accepted plan `bbd53dc00e0ecc637b7b1882b92961e1f05f34f8cf41b0544f630cb68e4e0108`.
- Project kind: software.
- SDD: deferred.

## Offline sync and home (2026-11-27)
- Cancelling an appointment, editing an appointment, stock and price changes are refused offline (`OFFLINE_BLOCKED`); only creates are queued.
- Creates carry a client-generated `clientId` in the body; replays are idempotent on the server.
- Signing out keeps the outbox (queued work is not lost); it clears every other cached query, including the IndexedDB copy.
- Queue tile: tonal tint while changes wait; error tint when the server refused one; the count is pending only.
