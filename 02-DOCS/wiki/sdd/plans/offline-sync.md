---
type: plan
title: Plan — Offline work with sync
description: Technical blueprint for the offline-sync spec: outbox, idempotent writes, cached reads and visible rejections. Waiting for owner approval before tasks and code.
tags: [sdd, plan, pwa, offline]
timestamp: 2026-11-26T00:00:00Z
topic: sdd
slug: offline-sync
branch: main
status: draft
---

# Plan — Offline work with sync

> Slug: `offline-sync` · Spec: [offline-sync](../specs/offline-sync.md) (approved 2026-11-26 with defaults D1 and D2) · Status: draft, waiting for owner approval

## Approach (structure, not code)
Three parts, each with one job:
1. **Read cache:** the server state the device has already seen, kept in IndexedDB through TanStack Query persistence. Reads work offline with no new read API.
2. **Outbox:** an ordered queue of writes in IndexedDB. Each entry has a client id (UUID). The app writes to the outbox first, then shows the change as pending.
3. **Sync worker:** sends outbox entries one by one, in creation order. It treats a server response as the result: success removes the entry, a business rejection (409) moves it to "rejected" and keeps it, and a network failure retries with backoff.

Idempotency lives on the server: every created record stores its client id with a unique index. A repeated request with the same id returns the record that already exists, so a timed-out send that actually succeeded never creates a duplicate.

## Backend
- **Client id on writes:** appointments, customers, vehicles and sales accept an optional `clientId` (UUID). Stored with a unique sparse index per collection.
- **Duplicate handling:** on a unique-key conflict for the same `clientId`, the create route returns the existing record with status 200 (not 201). A different body with a reused id is still 409, to catch bugs.
- **Stock rule unchanged:** an offline sale replays through the existing sales route, so the current 409 `INSUFFICIENT_STOCK` already gives D1 (rejected, no stock change, no sale created).
- **Overlap rule unchanged:** the existing 409 overlap error gives D2 for time conflicts.
- **Cancel is idempotent in the client:** a cancel that returns 409 `ALREADY_CANCELLED` counts as done, not as rejected.
- **Version check for D2 edits:** appointments get a `revision` number; an edit sent with an older revision returns 409 `CHANGED_ELSEWHERE` with the current record. Stored once per appointment, incremented on each change.

## Frontend
- **Persistence:** `@tanstack/query-persist-client-core` with an IndexedDB adapter (`idb-keyval`). Cache is dropped on sign-out. `navigator.storage.persist()` requested on first sync.
- **Outbox module (`features/offline/outbox.ts`):** enqueue, list, mark rejected, remove, retry. Pure functions over an IndexedDB store, so it is unit-testable without a browser.
- **Sync worker (`features/offline/sync.ts`):** runs on online, on foreground, and every 60 s while pending entries exist. Backoff 2 s, 4 s, 8 s, capped at 60 s. Stops on the first network error and resumes later, so order is kept.
- **Mutations:** each write hook checks connectivity. Online: send as now, with the client id attached. Offline: enqueue and show the record as pending. Stock adjustments and price changes are blocked offline with the message from the spec.
- **Presentation:** status line at the top ("Sin conexión · N pendientes" / "Sincronizado" / "Actualizado a las HH:MM"). Pending rows get a dashed outline and the word "Pendiente". Rejected rows show the reason and two actions: "Reintentar" and "Descartar".
- **Queue screen:** pending and rejected entries, reached from the "Más" entry of the navigation. Dependency: the bottom navigation from the frontend design plan. If it is not approved yet, the queue sits under the current Home tile, and moves later.

## Tasks (to be detailed after approval)
1. Backend: `clientId` on writes with unique index and replay returns existing record (AC3). Backend tests.
2. Backend: `revision` on appointments and `CHANGED_ELSEWHERE` (D2). Backend tests (AC6 part).
3. Frontend: query persistence to IndexedDB, cache cleared on sign-out, "Actualizado a las" line (AC1, AC8).
4. Frontend: outbox module and sync worker with backoff, rejected state, storage persistence request (AC2, AC4, AC5 client side). Unit tests.
5. Frontend: write hooks route through the outbox offline; blocked actions for stock and prices (AC7). Unit tests.
6. Frontend: status line, pending and rejected visuals, queue screen (AC9). Unit tests.
7. Playwright: offline agenda (AC1), queue survives reload (AC8), blocked stock adjust offline (AC7), reconnect sends once (AC2, AC4), axe on agenda, sales and queue (AC10).
8. Deploy API and Hosting after owner approval; verify endpoints reject unauthenticated calls.

## Risks and how the plan handles them
- **Duplicate records after timeouts:** handled by `clientId` with a unique index (task 1). Tested by replaying the same request.
- **Stock drift between devices:** handled by D1; no negative stock, rejection kept for staff.
- **iOS has no Background Sync:** sync runs only with the app open; the status line says so.
- **Storage eviction:** `navigator.storage.persist()` requested; a warning is shown when denied. Pending entries are never removed by cache cleanup, only by sync or staff action.
- **New dependencies:** `idb-keyval` and the TanStack persist packages. Versions to be checked at install time (at least two weeks old, as the rules require).

## Open dependency
The queue screen depends on the navigation decision from the frontend design plan (bottom bar with "Más"). Not blocking tasks 1 to 5.
