# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Staff at the car-wash counter, using a phone. Confirmed by the owner. They load appointments, sell services and products, look up customers and vehicles, and keep stock. They often work in short, interrupted moments and sometimes with a weak connection.

The owner signs in too, but the owner's management view is not part of this redesign yet.

## Product Purpose

Waxline is the day-to-day operations tool for a car wash: agenda, customers and vehicles, services, products and stock, sales, and a queue of changes waiting to sync. Success means a staff member finds today's work and records a sale or appointment in seconds, without losing data when the connection drops.

## Operating Context

- Used on a phone at the counter, one-handed, between customers.
- Works offline. Changes wait in a local queue and are sent when the connection returns.
- Interface is in Spanish. Inferred, not confirmed: Argentina (the seed uses +54 phone numbers).

## Capabilities and Constraints

- Sign in with username and password. Sessions are server-side.
- Appointments follow an overlap rule per employee. Cancelling and editing need a connection.
- Sales and stock adjustments are recorded through the same offline queue.
- Stack: React 19 with Vite on Firebase Hosting, Express API on Cloud Run, MongoDB.

## Brand Commitments

None. There is no logo or brand palette yet. The current blue is an interim choice, not a commitment.

## Evidence on Hand

No photography or marketing copy. The UI copy in `frontend/src/shared/messages.ts` is the only product voice.

## Product Principles

- Today's work comes first. The first screen answers "what do I do now".
- Nothing is lost silently. A pending or refused change is always visible.
- One primary action per screen. Destructive actions are never the primary one.
- Speed over decoration. A returning user reaches a task in one tap.

## Accessibility & Inclusion

WCAG 2.2 AA, enforced by the axe tests in `frontend/src`. Targets are at least 44 px. Focus is always visible. Colour is never the only signal for state.

## Open Decisions

- Dark theme: not decided.
- Owner's management view (summary, sales and stock totals): not in this redesign.
- Real-phone check on hardware: pending.
