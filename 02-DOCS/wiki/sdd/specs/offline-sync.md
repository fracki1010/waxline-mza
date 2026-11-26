---
type: spec
title: Spec — Offline work with sync for the PWA
description: WHAT and WHY for staff working without signal, with a queue of changes that syncs when the connection returns. Draft with recommended defaults for owner approval.
tags: [sdd, spec, pwa, offline]
timestamp: 2026-11-26T00:00:00Z
topic: sdd
slug: offline-sync
branch: main
status: approved
---

# Spec — Offline work with sync for the PWA

> Slug: `offline-sync` · Status: approved by owner 2026-11-26 with defaults D1 and D2 · Created: 2026-11-26
> Inherits: [constitution](../constitution.md) · Depends on: [sales-and-stock](sales-and-stock.md), [appointments](appointments.md), [staff-auth](staff-auth.md)

## Problem & why
The car wash has weak signal in some areas, and staff must keep working when it drops: showing today's appointments, taking a new booking, recording a sale. Today every screen needs the API, so a dropped connection stops the work.

## Owner decision so far
- Offline work with a sync queue, instead of only showing the last known state (owner answer, 2026-11-26: "de esa manera").

## Goals
- Staff see today's agenda, customers, products and services with no signal, from the last sync.
- Staff can create and cancel appointments, create customers and vehicles, and record and cancel sales with no signal.
- Every change made offline reaches the server exactly once when the connection returns, in the order it was made.
- Staff always see what is still pending and what was rejected at sync.

## Non-goals / out of scope
- Real-time updates pushed from the server to other devices (staff refresh or sync to see others' changes).
- Offline stock adjustments, product price changes and service price changes: they need the server's current quantity and are blocked when there is no signal.
- Background sync while the app is closed: iOS Safari has no Background Sync API, so syncing happens only while the app is open.
- Offline sign-in: a first sign-in needs the connection. A session that is still valid works offline.
- Multi-user conflict resolution beyond the rules in this spec.

## Users & context
Signed-in staff on phones, often with unstable signal. Any staff member can do every action (same as [appointments](appointments.md) and [sales-and-stock](sales-and-stock.md)).

## The four ASDD questions
1. **What can the user do?** Read cached data, queue appointments, customers, vehicles and sales, and see the queue and its rejections.
2. **What result do they get?** The change appears immediately on their device marked as pending, then becomes normal once the server accepts it. A rejected change stays visible with the reason until staff resolve it.
3. **What must it respect?** No duplicate records after a retry; stock never goes below zero on the server; the overlap rule for appointments still holds; a cancelled sale still does not count in totals.
4. **How does it prove it?** Acceptance criteria below, each with an automated test (unit, or Playwright with the browser offline) or a manual check on a real phone.

## Behaviour

### What is cached
- The last successful reads of agenda days, customers with vehicles, products, services and staff are kept on the device.
- Cached data shows a "Actualizado a las HH:MM" line so staff know how old it is.

### What is queued while offline
| Action | Works offline | Notes |
|---|---|---|
| Create appointment | Yes | Overlap is checked at sync (see conflicts) |
| Cancel appointment | Yes | |
| Edit appointment | Yes | Conflicts rule applies |
| Create customer and vehicle | Yes | |
| Record sale | Yes | Stock is checked at sync (see conflicts) |
| Cancel sale | Yes | Restores stock at sync |
| Adjust product stock | No | Blocked with a clear message |
| Change product or service prices | No | Blocked with a clear message |

### Outbox
- Every queued change gets a client-generated id (UUID) and a creation time.
- The server stores that id with each record it creates, and a repeated request with the same id returns the original result (no duplicate records after a retry).
- Changes are sent one by one in creation order. If one is rejected, the later ones that depend on it are still sent, and the rejection is shown.

### Sync
- Sync starts when the connection returns, when the app comes back to the foreground, and every 60 seconds while the app is open with pending changes.
- Failed sends retry with backoff (2 s, 4 s, 8 s, up to 60 s). A response from the server with a business rejection is not retried.

### Conflicts and rejections (recommended defaults, owner decision D1 and D2)
- **D1 — Sale offline when stock is gone at sync.** Default: the sale is kept with status "Rechazada: sin stock" and the staff member sees it in the queue. It is not created with negative stock, and it is not silently dropped. Staff can cancel it, or re-record it with the current stock.
- **D2 — Appointment conflicts at sync.** Two causes: the time is now taken (overlap rule), or the appointment was edited on another device after this device last synced. Default: the server version wins, the local draft is kept as "Rechazada: horario ocupado" or "Rechazada: cambiado en otro equipo", and staff can see both and retry with a new time.
- Rejections never change the data on the server; they only leave a local record for staff to act on.

### Visible state
- A status line at the top of the app: "Sin conexión" and the number of pending changes, or "Sincronizado" when there are none.
- A pending record shows a dashed outline and the word "Pendiente" (color is never the only signal).
- The queue and rejections are listed in the "Más" section, with the action to retry or resolve each one.

### Install and updates
- The app is installable (manifest with standalone display and maskable icons).
- A new version shows "Hay una versión nueva" with a manual reload. The reload never runs while a form has unsaved data or while changes are pending.

## Acceptance criteria
- **AC1** With the browser offline, today's agenda and the customer list render from the cache and show the last-sync time. Automated: Playwright, network offline after one online load.
- **AC2** A queued appointment created offline appears on the device as "Pendiente" and is created on the server exactly once after reconnecting, even if the first send timed out. Automated: unit on the outbox and API idempotency test.
- **AC3** Replaying the same outbox request id returns the original record and creates no duplicate. Automated: backend test.
- **AC4** A sale recorded offline for a product with enough stock at sync is created and lowers stock once. Automated: backend test plus Playwright.
- **AC5** A sale whose product has no stock at sync is kept as "Rechazada: sin stock" and does not change stock or create a sale on the server. Automated: backend test.
- **AC6** An appointment whose time is taken at sync is kept locally as "Rechazada: horario ocupado" with the existing overlap message. Automated: backend test plus Playwright.
- **AC7** Stock adjustments and price changes show the blocking message and do nothing when offline. Automated: Playwright with the browser offline.
- **AC8** The queue survives a page reload and a closed app (IndexedDB). Automated: Playwright reload with pending changes.
- **AC9** Visual check on a real phone: pending state and rejected state are readable and do not rely on color alone. Manual, owner or assistant with the phone.
- **AC10** Axe reports no critical or serious violations on the agenda, sales and queue screens. Automated: existing a11y spec extended.

## Constraints and risks
- **iOS Safari:** no Background Sync; sync runs only while the app is open. Stated to staff in the status line.
- **Storage:** IndexedDB on the device can be cleared by the browser under storage pressure. Pending changes are the one thing that must not be lost; the spec requires asking for persistent storage (`navigator.storage.persist()`) and warning staff when it is denied.
- **Clock on the device:** creation times are for ordering and display only; the server time is the record time.

## Open questions for the owner
- **D1** Offline sale without stock at sync: keep as rejected for staff to resolve (default), or block offline sales for products with low stock?
- **D2** Appointment conflicts at sync: server wins with the local draft kept (default), or let staff pick the local version?
