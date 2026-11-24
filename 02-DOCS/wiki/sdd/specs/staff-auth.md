---
type: spec
title: Spec — Staff sign-in
description: WHAT and WHY for staff sign-in — problem, goals, behaviour, acceptance criteria.
tags: [sdd, spec]
timestamp: 2026-11-24T00:00:00Z
topic: sdd
slug: staff-auth
status: draft (approved in autopilot, not item by item)
---

# Spec — Staff sign-in

> Slug: `staff-auth` · Status: draft, approved in autopilot (blanket "automatic" go-ahead, not item by item) · Created: 2026-11-24
> Inherits: [constitution](../constitution.md)

## Problem & why
The car-wash app will hold appointments and stock and will be reachable from the internet (front end and server are separate). Anyone who finds the address could read or change that data. Only the car-wash staff may use it, so the app needs to know who is using it before showing anything.

## Cost of not building it
Appointment and stock data would be open to anyone who finds the server address, or the app could only run on a closed network. Both block shipping the first real feature (appointments), which must not be built unprotected.

## The cheapest alternative
One shared password for the whole shop. It is the least work and would stop strangers, but nobody could tell who loaded or changed an appointment, and a leaver's access could only be removed by changing the password for everyone. Not enough once more than one person loads data.

## Goals
- Only people with a staff account can see or change anything in the app.
- A staff member stays signed in on their phone or desktop between visits, so they do not retype credentials on every shift.
- Each action can later be attributed to a person.

## Non-goals / out of scope
- Customer accounts or customer self-booking.
- Roles and permissions beyond "staff" (everyone signed in can do everything for now).
- Screens to create, edit or remove staff accounts; the first account is created outside the app by the owner.
- Password reset by email, social login, two-factor authentication.
- Remembering a device for months; any sign-in provider other than the app's own accounts.

## Users & context
Car-wash staff (the owner and employees) using the installed PWA on a phone at the counter, or the web app on a desktop. Several people may share one device during a shift.

## What the user can do
A person with a staff account can sign in with their username and password, stay signed in across visits, and sign out. A signed-out person can do nothing except see the sign-in screen. Nobody can create their own account from the app.

## What result they get
After a correct sign-in the person lands on the app's home screen showing their name; after sign-out they land on the sign-in screen. The reference is mechanical because no human sketch exists yet: the observable outcomes in the acceptance criteria below are the reference (screen shown, access allowed or refused). A `review-after` entry asks the human to confirm the sign-in screen look later.

## What it must respect
- Constitution principles 14-18: no secret committed, every route except sign-in and health requires a signed-in staff member, passwords stored only hashed, inputs validated, CORS limited to the front-end origin.
- The front end and server live on different addresses (decision log 2026-11-24), so sign-in must work across them, including on an installed PWA.
- Nothing about the existence of a username may leak through error messages.

## How it proves it
Automated integration tests, one per acceptance criterion, run with the project's test command. The run output and the list of passed criteria are saved in the verification record under `02-DOCS/wiki/sdd/verifications/`. The "installed PWA keeps the session" criterion is also checked by hand once on a real phone and recorded as such.

## Behaviour
- Main path: the person enters username and password, is signed in, and sees the home screen. On the next visit they are still signed in. Signing out ends the session on that device.
- Edge cases: a second device signs in independently; signing out on one does not sign out the other. An expired session returns the person to the sign-in screen without losing the page they wanted (they return to it after signing in).
- Error paths: wrong username or wrong password gives the same generic message. After repeated failures the account is temporarily refused even for the correct password, with a message that says to try later. A request without a valid session is refused, and the front end shows the sign-in screen.

## Acceptance criteria
- Given a staff account, When the correct username and password are submitted, Then the person is signed in and the home screen shows their name.
- Given a staff account, When a wrong password is submitted, Then sign-in is refused with a message that is identical to the one for an unknown username.
- Given an unknown username, When any password is submitted, Then the response is indistinguishable from a wrong password for a known username.
- Given a signed-out visitor, When they request any app data or screen other than sign-in, Then access is refused and they are shown the sign-in screen.
- Given a signed-in person, When they close and reopen the app within the session lifetime, Then they are still signed in.
- Given a signed-in person, When they sign out, Then the previous session no longer grants access on that device.
- Given a person who made 5 failed sign-in attempts within 15 minutes, When they submit the correct password, Then sign-in is still refused until the window passes.
- Given a session older than its lifetime without use, When the person opens the app, Then they are asked to sign in again.

## Points to clarify
- **suposición tomada** — a session lasts 14 days since last use. *Base:* a counter-staff phone reopened daily or weekly. *Riesgo:* if the owner wants shorter or longer, one acceptance criterion changes.
- **suposición tomada** — lockout is 5 failed attempts in 15 minutes. *Base:* common default for small apps. *Riesgo:* staff mistyping in a rush could be locked out at the counter.
- **suposición tomada** — everyone signed in has the same powers. *Base:* a small shop and the "small" scope. *Riesgo:* if the owner needs to hide stock costs from employees, roles come earlier.
- **suposición tomada** — sign-in uses a username, not an email. *Base:* staff may not have a work email. *Riesgo:* if email is preferred, the account-creation step changes.
- **suposición tomada** — the first account is created by the owner outside the app. *Base:* no account screens are in scope. *Riesgo:* every new employee needs the owner's technical help until account screens are built.
- **pregunta abierta** — which language should the sign-in screen and its messages use?
- **área no formulable** — whether a PWA installed on iOS keeps the session when the front end and server are on different addresses; the browser may restrict cross-site storage, and the answer may change what "stays signed in" can promise.
- **decisión diferida** — account management screens, roles, password reset; each is its own later feature.
- **suposición tomada** — the objection to building this: Firebase Hosting already offers a managed sign-in service that would avoid storing passwords on the owner's server. *Base:* the owner chose own-server backend and own accounts (MERN, constitution 16). *Riesgo:* running own password storage is more security work; if it proves heavy, switching providers is a MAJOR amendment.
