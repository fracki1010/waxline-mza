---
type: spec
title: Spec — Sales, stock, customers and vehicles
description: WHAT and WHY for products in stock, customers with their vehicles, and sales. Draft: assumptions need owner approval.
tags: [sdd, spec]
timestamp: 2026-11-26T00:00:00Z
topic: sdd
slug: sales-and-stock
branch: main
status: draft
---

# Spec — Sales, stock, customers and vehicles

> Slug: `sales-and-stock` · Status: **draft**, not approved · Created: 2026-11-26
> Inherits: [constitution](../constitution.md) · Depends on: [staff-auth](staff-auth.md), [appointments](appointments.md)

## Problem & why
The car wash sells products (for example, wax and air fresheners) and records services for each vehicle, but nothing in the app tracks what is sold, what is left, or who the customer and vehicle are. Staff keep this in their heads or on paper.

## Owner decisions so far
- Stock is used for products that the car wash also sells to customers (owner answer, 2026-11-26).

## Goals
- Staff keep a list of products with the quantity on hand.
- Staff record a sale for a customer and vehicle, with services and products, and get a total.
- A sale lowers the stock of its products; cancelling a sale gives the stock back.
- Staff find a customer and their vehicles without retyping them.

## Non-goals / out of scope
- Payments, cash register, invoices and receipts (assumption A5).
- Purchases from suppliers and stock counts with adjustments (assumption A6).
- Recipes that consume products per service (assumption A7).
- Customer self-service, reminders and loyalty.

## Users & context
Signed-in staff only. Any staff member can do every action; there are no roles yet (same as [appointments](appointments.md)).

## The four ASDD questions
1. **What can the user do?** Keep products and prices; keep customers and their vehicles; record, view and cancel sales.
2. **What result do they get?** A sale with a total, stock lowered for each product sold, and a clear refusal when a product has not enough stock.
3. **What must it respect?** Stock never goes below zero; a cancelled sale is not counted in totals; staff-auth sessions.
4. **How does it prove it?** Acceptance criteria below, each with an automated test or a manual check.

## Behaviour

### Products
- A product has a name, a unit (for example "unidad", "litro"), a price in pesos and a quantity on hand.
- Staff add, rename, change the price, and adjust the quantity by a signed amount.
- A product is never deleted; it can be deactivated and then cannot be added to new sales.

### Services and prices
- A service (from the existing service list) has a price in pesos. Changing a price does not change past sales.

### Customers and vehicles
- A customer has a name and a phone. A vehicle has a plate and a model and belongs to one customer.
- A customer can have several vehicles.
- Staff search customers by name, phone or plate.

### Sales
- A sale has one customer, one vehicle, the date and time, and one or more lines.
- A line is a service or a product with a quantity; a product line takes its price at the moment of sale.
- The total is the sum of the lines, in pesos. A sale with no lines is refused.
- A sale can be created on its own or from an appointment (the appointment's customer, vehicle and service fill the sale).
- Each product line lowers the product's quantity. If any product has less stock than the sale needs, the whole sale is refused and nothing changes.
- A cancelled sale stays listed as cancelled, is left out of totals, and gives its product quantities back.

### Assumptions to approve (defaults shown)
- **A1 — Prices:** each product and service has one current price in pesos entered by staff. Default: yes.
- **A2 — Stock refusal:** a sale that needs more than the quantity on hand is refused. Default: yes, no negative stock.
- **A3 — Cancel:** staff can cancel a sale; it does not disappear from the list. Default: yes.
- **A4 — Customers from appointments:** an appointment keeps its typed customer data for now; linking it to a stored customer comes later. Default: yes.
- **A5 — Payments:** no payment method or cash register in this slice; a sale only has a total. Default: yes.
- **A6 — Stock movements:** only sales and manual quantity adjustments change stock; no purchases or supplier orders in this slice. Default: yes.
- **A7 — Recipes:** a service does not consume products automatically. Default: yes.

## Acceptance criteria
- AC1: Staff add a product with a price and a quantity; it appears in the product list.
- AC2: A sale with one service and one product lowers the product quantity by the sold amount.
- AC3: A sale that needs more stock than available is refused, and no quantity changes.
- AC4: Cancelling a sale gives the product quantities back and removes it from the total.
- AC5: Changing a price does not change the total of an existing sale.
- AC6: A sale with no lines is refused.
- AC7: Staff find an existing customer by name, phone or plate.
- AC8: A customer can have two vehicles, and a sale uses one of them.
- AC9: A deactivated product cannot be added to a new sale and still shows on old sales.

## Open questions for the owner
1. Do you approve A1 to A7 as written? Change any of them that do not match how the car wash works.
2. Should stock go negative when a product is sold without stock on hand? Default: no.
