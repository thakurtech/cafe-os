# CaféOS — Current State

Developer handover for the platform as it stands. Covers what is implemented,
what each API route does, and the known gaps a maintainer should be aware of.

## Layout

| Path | Stack | Port (dev) |
|---|---|---|
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind 4, recharts, sonner | 3000 |
| `backend/` | NestJS, Prisma 5, PostgreSQL | 3001 |

Run both: `npm run dev` in `frontend/`, `npm run start:dev` in `backend/`.

## Roles

`SUPER_ADMIN`, `CAFE_OWNER`, `MANAGER`, `CASHIER`, `CHEF`, `CAPTAIN`,
`AFFILIATE`, `CUSTOMER` (see `Role` in `backend/prisma/schema.prisma`).

### JWT_SECRET is required in production

`JWT_SECRET` must be set to a strong, random value of at least 16 characters
before starting with `NODE_ENV=production`. The process **refuses to boot**
otherwise. This is deliberate: both the `JwtModule` and the passport strategy
used to fall back to the literal `'your-secret-key'`, so a deployment that
forgot the variable signed tokens with a value published in this repository and
anyone could mint a `role: SUPER_ADMIN` token.

Outside production a random per-process secret is generated with a loud warning,
so a fresh clone runs without setup. It changes on every restart, which
invalidates dev tokens by design — the insecure path should never look like a
working one. See `src/auth/jwt-secret.ts`.

Auth is JWT bearer. `JwtStrategy.validate()` puts `{ userId, email, role }` on
`request.user` — note the property is **`userId`**, not `id`. Reading
`req.user.id` yields `undefined` and silently breaks the lookup; this was a real
bug in the affiliate and loyalty controllers.

`RolesGuard` reads `@Roles(...)` metadata from the handler first, then the
controller class, so a controller-level decorator applies to every route and a
method-level one overrides it.

## Super-admin surface

All routes below are under `/super-admin`, guarded by `JwtAuthGuard` +
`RolesGuard` with `@Roles('SUPER_ADMIN')` at the class level.

| Method | Route | Purpose |
|---|---|---|
| GET | `/platform-stats` | MRR, cafe/user/order counts, real period-over-period growth |
| GET | `/analytics?days=` | Revenue & order totals, daily series, cafe leaderboard, channel/payment mix, hour-of-day. Window clamped 1–365 |
| GET | `/revenue` | MRR/ARR/ARPA, plan & status mix, 12-month MRR trend, trials ending, renewals due, per-cafe billing |
| GET | `/affiliates` | Partner performance, balances, pending payout queue, settlement history |
| POST | `/affiliates/payouts/:id/approve` | Settle a payout and debit the affiliate balance |
| POST | `/affiliates/payouts/:id/reject` | Decline a payout, balance untouched |
| GET · PATCH | `/settings` | Platform pricing, trial/grace length, feature switches |
| GET | `/support` | Ticket inbox, `?status=` `?priority=` filters |
| GET | `/support/stats` | Backlog, urgent count, awaiting first reply, avg first response, resolved this week |
| POST | `/support` | Log a ticket on a cafe's behalf |
| GET | `/support/:id` | One ticket with its full thread, internal notes included |
| POST | `/support/:id/replies` | Reply, or add an internal note with `isInternal: true` |
| PATCH | `/support/:id` | Change status and/or priority |
| GET | `/marketing` | Campaign tallies, attribution by source, announcements |
| POST · PATCH · DELETE | `/marketing/announcements[/:id]` | Broadcast CRUD |
| GET | `/cafes`, `/recent-signups` | Cafe list and latest signups |

### Rules worth knowing before you change this code

- **What counts as MRR** is defined once, by
  `NON_BILLING_SUBSCRIPTION_STATUSES` in `super-admin.service.ts`
  (`CANCELLED`, `SUSPENDED`, `TRIAL` are excluded). `RevenueService` imports
  it so the dashboard and revenue page cannot drift apart. Change it in one
  place only.
- **`PAST_DUE` and `GRACE` are inside MRR.** They are contracted revenue that
  has not been collected, reported separately as "at risk". They are not
  churn.
- **MRR growth is not a historical snapshot.** The schema stores no history of
  subscription state, so growth compares current MRR against MRR from
  subscriptions that already existed at the window start. It measures MRR
  *added*, not true month-over-month movement. Same caveat applies to the
  12-month trend: churned accounts are absent from every month, not just
  recent ones. Fixing this properly needs a subscription-events table.
- **Time series are inclusive of today.** `buildTimeseries` seeds
  `days + 1` buckets. An exclusive upper bound silently drops today's orders
  from the chart while they still count in the headline totals — that was a
  real bug, and `super-admin.service.spec.ts` asserts the charted order count
  equals the reported total.
- **Cancelled orders never count** toward revenue, volume or attribution.
- **Payout approval is race-safe.** The `PENDING -> PAID` transition is claimed
  with a conditional `updateMany` inside a transaction, so two concurrent
  approvals cannot both debit the balance; the loser matches zero rows and is
  rejected.
- **Internal support notes are load-bearing.** A public reply stamps
  `firstRespondedAt` once and moves the ticket to `PENDING`; an internal note
  does neither, so it cannot quietly satisfy the response-time metric. Cafes
  never receive internal notes.

## Cafe-facing support (`/support`)

Guarded by `JwtAuthGuard` only — any authenticated cafe user.

| Method | Route | Purpose |
|---|---|---|
| POST | `/support` | Raise a ticket |
| GET | `/support` | List own shop's tickets |
| GET | `/support/:id` | One own ticket with public replies |
| POST | `/support/:id/replies` | Reply, reopening the ticket |

**The shop is resolved from the authenticated user's row, never from the
request body.** `CreateCafeTicketDto` deliberately has no `shopId`. A ticket
belonging to another shop returns *not found* rather than *forbidden*, so the
API does not confirm that another cafe's ticket exists. A cafe reply is always
forced public regardless of any `isInternal` flag sent.

## Testing

`cd backend && npx jest` — no database required. Prisma is stubbed
per suite; several stubs are stateful so double-spend and cross-tenant access
are exercised for real rather than mocked away.

## Known gaps

1. **No global `ValidationPipe`.** `class-validator` is installed and
   `LoginDto`/`RegisterDto` carry decorators, but nothing registers the pipe in
   `main.ts`, so those decorators never execute and `/auth/login` and
   `/auth/register` accept any payload shape. Newer endpoints apply a
   `ValidationPipe` per route as a workaround. Registering it globally is the
   right fix but will start rejecting payloads that currently pass.
2. **Migration history vs. schema.** The database has been managed partly by
   ad-hoc scripts (`create-tables.js`, `run-migration.js`) rather than
   `prisma migrate`. Verify `prisma migrate deploy` reproduces
   `schema.prisma` on an empty database before relying on it.
3. **Credentials in the repo.** Several maintenance scripts under `backend/`
   have a database connection string inlined. These must read
   `process.env.DATABASE_URL`, and any credential that was committed has to be
   rotated at the provider — deleting the line is not enough, because the value
   remains in git history.
4. **`eslint` prettier noise.** The prettier config defaults to 2-space indent
   while the codebase is 4-space, so lint reports errors across files nobody
   has touched. Either set `tabWidth: 4` in `.prettierrc` or run a single
   repo-wide format commit; until then, match the surrounding 4-space style.
5. **Analytics uses server local time throughout.** Day buckets, the
   `ordersToday` KPI and hour-of-day buckets all use the server's timezone, so
   they agree with each other. Set `TZ` to the deployment's region. Still
   wrong once cafes span multiple timezones — that needs a per-shop timezone.
6. **Platform settings are write-only.** `PlatformSetting` is read by nothing
   outside `settings.service.ts`. `maintenanceMode`, `newSignupsEnabled`,
   `affiliateProgramEnabled`, `loyaltyEnabled`, `gamesEnabled`, `trialDays`,
   `gracePeriodDays`, the plan prices and `defaultCommissionRate` all persist
   and report success, but no other service consults them. Flipping
   `maintenanceMode` does not take ordering offline. Wiring each one to its
   feature is outstanding work.
7. **Affiliate referrals never leave TRIAL.** The only writer of
   `AffiliateReferral.status` hardcodes `'TRIAL'`, so `convertedReferrals`,
   `producingAffiliates` and the affiliate's own `activeCafes` are
   structurally zero forever. Subscription activation should write the
   converted status. Note the two services also disagree on the value:
   `super-admin/affiliates.service.ts` counts `ACTIVE` and `CONVERTED`,
   `affiliate/affiliate.service.ts` counts only `ACTIVE`. Pick one, put it in
   a shared constant.
8. **Partial refunds are not deducted from revenue.** A FULL refund sets the
   order to `CANCELLED` and is therefore excluded, but a PARTIAL refund leaves
   the order `COMPLETED` at its original `totalAmount` and no service
   subtracts `Refund.amount`. A ₹1000 order with a ₹600 refund still counts
   as ₹1000 everywhere. `paymentStatus` is also ignored, so unpaid orders
   count as revenue — consistent across `shops`, `reports` and `super-admin`,
   so it is a platform-wide definition rather than drift.
9. **The app will not boot without `RAZORPAY_KEY_ID`.** `PaymentsService`
   constructs its Razorpay client at DI time, so a missing optional payment
   key takes auth, POS and kitchen down with it. Lazy-initialising that client
   would let the platform run without payment credentials.
10. **An already-seeded super admin is not rotated.** Deployments that booted
   the old code still have `admin@cafeos.com` with the password `password`.
   Change it by hand.
