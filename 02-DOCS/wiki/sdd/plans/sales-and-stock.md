---
type: plan
title: Plan — Sales, stock, customers and vehicles
description: Technical blueprint for the approved sales-and-stock spec. Draft for owner review.
tags: [sdd, plan]
timestamp: 2026-11-26T00:00:00Z
topic: sdd
slug: sales-and-stock
branch: main
status: draft
---

# Plan — Sales, stock, customers and vehicles

> Spec: [sales-and-stock](../specs/sales-and-stock.md) (approved 2026-11-26) · Status: draft, not approved

## Approach
Four collections in the existing MongoDB database, one route file per area, the same error shape and session middleware as the rest of the API. Stock changes go through conditional updates, so a product is never lowered below zero even with two sales at once.

## Data

| Collection | Fields |
| --- | --- |
| `products` | `name`, `unit`, `price` (pesos, integer), `quantity` (integer ≥ 0), `active` |
| `customers` | `name`, `phone` |
| `vehicles` | `customerId`, `plate`, `model` |
| `sales` | `customerId`, `vehicleId`, `appointmentId?`, `lines[]`, `total`, `status` (`active` / `cancelled`), `createdAt`, `cancelledAt?` |
| `services` (existing) | add `price` (pesos, integer) |

A sale line stores `kind` (`service` or `product`), `refId`, `name`, `quantity`, `unitPrice` and `lineTotal`, so later price or name changes do not alter past sales (AC5).

## Stock rule (AC2, AC3, AC4)
A sale with product lines decrements each product with a conditional update: `updateOne({ _id, quantity: { $gte: q } }, { $inc: { quantity: -q } })`. If any update matches nothing, the sale is refused and the decrements already applied are reversed in the same request. Cancelling a sale increments the same quantities back.

Why not a transaction: the local test database may not be a replica set, and the compensation path is covered by a test that forces the second product to fail.

## Endpoints

| Method and path | Purpose | Errors |
| --- | --- | --- |
| `GET /api/products` | list products | — |
| `POST /api/products` | add a product | `VALIDATION_ERROR` |
| `PATCH /api/products/:id` | rename, change price, deactivate | `NOT_FOUND`, `VALIDATION_ERROR` |
| `POST /api/products/:id/adjust` | add or remove stock by a signed amount | `NOT_FOUND`, `VALIDATION_ERROR`, `INSUFFICIENT_STOCK` |
| `GET /api/customers?q=` | search by name, phone or plate | — |
| `POST /api/customers` | add a customer | `VALIDATION_ERROR` |
| `POST /api/customers/:id/vehicles` | add a vehicle to a customer | `NOT_FOUND`, `VALIDATION_ERROR` |
| `GET /api/sales?from=&to=` | list sales in a range | — |
| `POST /api/sales` | record a sale | `VALIDATION_ERROR`, `NOT_FOUND`, `INACTIVE_PRODUCT`, `INSUFFICIENT_STOCK` |
| `POST /api/sales/:id/cancel` | cancel a sale and return stock | `NOT_FOUND`, `ALREADY_CANCELLED` |

All endpoints sit behind the existing session middleware.

## Frontend
- Home gets three entries: Productos, Clientes, Ventas.
- Productos: list with quantity and price, add form, adjust stock, deactivate.
- Clientes: search box, customer form, vehicles under each customer.
- Ventas: day list (same date controls as the agenda), new sale form (customer, vehicle, lines), cancel button.
- Same visual system as the agenda; new strings go in `messages.ts`.

## Tasks, in order

1. **Services price and products** — backend model, routes and tests for AC1 and the stock adjust endpoint.
2. **Customers and vehicles** — backend model, routes and tests for AC7 and AC8.
3. **Sales** — backend route with the stock rule and cancel; tests for AC2, AC3, AC4, AC5, AC6 and AC9, including the compensation path.
4. **Frontend screens** — Productos, Clientes, Ventas, reusing existing components and tokens.
5. **Checks** — unit tests, lint, typecheck, build, Playwright E2E with axe on the new screens.
6. **Deploy** — API to Cloud Run and Hosting, after the owner approves.

Each task ends with its checks passing before the next one starts.

## Risks
- Two sales for the last unit of a product at the same time: the conditional update lets only one succeed.
- A product deactivated after a sale is created still returns its stock on cancel (intended).
- Vehicle plate uniqueness is not in the spec; this plan does not enforce it yet.

## Open for the owner
- Approve this plan, or change the endpoint list or the task order.
