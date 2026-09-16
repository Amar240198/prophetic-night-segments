# Immutable calendar ownership completion

## Implementation

The resumed working tree retains migration 004, the immutable event ledger, provider
mappings, signed Google metadata, shared one-night/horizon identity, tombstones,
disconnect retention, legacy recovery and IndexedDB-backed export identities.

Completion adds ledger-based removal of every persisted type in an explicitly confirmed
horizon, including retired kinds; strict supported-version and legacy metadata checks;
nonempty ETag validation; calendar-scoped tombstone updates; and regression tests for
scope, account/calendar isolation, legacy recovery, pagination, failed confirmation,
lease expiry and one-night/horizon overlap. No mathematical engine or migrations 001–003
were changed. The lockfile retains only the added fake-indexeddb dependency.

## Validation

| Check                           | Final result                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Targeted calendar tests         | 174 passed across 7 files                                                                                          |
| Full `pnpm test`                | 236 passed across 14 files                                                                                         |
| `pnpm typecheck`                | Passed (workspace packages, API and web)                                                                           |
| `pnpm lint`                     | Passed with zero warnings allowed                                                                                  |
| `pnpm build`                    | Passed; all 14 pages generated                                                                                     |
| `pnpm format:check`             | Passed                                                                                                             |
| Migration 001 → 002 → 003 → 004 | Passed in PGlite; IDs, service dates, preferences, sessions and foreign keys preserved; immutable updates rejected |
| Production migration            | Not run; manual deployment gate                                                                                    |

The first sandboxed production build could not bind a Turbopack worker port. The
build passed with the existing approved permission for local worker-port access.
Google/provider calls are mocked; migration tests use isolated PGlite PostgreSQL.
No live Google writes or production migration are performed by these checks.

## Deployment gate

Migration 004 is manual. Neither package scripts nor Next.js configuration runs SQL.
No repository Vercel deployment override was found; the local `.vercel/project.json`
is absent, so live Vercel project settings were not independently verified here.

Do not push this migration-dependent application before production schema compatibility
is confirmed. Pause calendar mutations and drain in-flight requests, then apply 004 once
to the intended production database with securely loaded credentials:

```sh
PGDATABASE="$DATABASE_URL" psql -X --set=ON_ERROR_STOP=1 --file=migrations/004_calendar_ownership.sql
```

The previous calendar writer is incompatible with the new identity constraints; keep
mutations paused until this application is deployed. See the [rollout instructions](google-calendar-sync.md#rollout--migration-004-before-application-deployment)
for schema verification, signing-key retention, and deployment order. Production data
has not been modified. Push and Vercel deployment remain intentionally withheld.

## Remaining operational limits

- Historical ownership signing keys must remain available to verify existing events.
- Clearing browser storage loses the local ICS identity registry. Imported copies remain
  controlled by the receiving calendar app, without granting remote control to Sixth.
- Unverified legacy one-night exports remain untouched; no timestamp/title fallback exists.
- Provider discovery fails closed after 20 pages or a repeated page token. All-type removal
  is bounded to 2,880 ledger targets within the authorised horizon.
- Continuous still means an explicit initial 90-night sync and saved preference; automatic
  renewal is not implemented. Production rate limiting and live OAuth smoke checks remain
  deployment responsibilities as documented in the setup guide.

## Exact changed files

This inventory includes the previous session's preserved changes and this completion.
The deleted Google template-link helper is identified explicitly.

- [.env.example](../.env.example)
- [.gitignore](../.gitignore)
- [.prettierignore](../.prettierignore)
- [README.md](../README.md)
- [docs/calendar-ownership-completion.md](../docs/calendar-ownership-completion.md)
- [docs/google-calendar-setup.md](../docs/google-calendar-setup.md)
- [docs/google-calendar-sync.md](../docs/google-calendar-sync.md)
- [eslint.config.mjs](../eslint.config.mjs)
- [migrations/004_calendar_ownership.sql](../migrations/004_calendar_ownership.sql)
- [package.json](../package.json)
- [pnpm-lock.yaml](../pnpm-lock.yaml)
- [src/app/api/google-calendar/events/route.ts](../src/app/api/google-calendar/events/route.ts)
- [src/components/CalendarCard.test.tsx](../src/components/CalendarCard.test.tsx)
- [src/components/CalendarCard.tsx](../src/components/CalendarCard.tsx)
- [src/components/GoogleCalendarSection.test.tsx](../src/components/GoogleCalendarSection.test.tsx)
- [src/components/GoogleCalendarSection.tsx](../src/components/GoogleCalendarSection.tsx)
- [src/components/ScheduleTools.test.ts](../src/components/ScheduleTools.test.ts)
- [src/components/ScheduleTools.tsx](../src/components/ScheduleTools.tsx)
- [src/lib/calendar/buildCalendarEvents.ts](../src/lib/calendar/buildCalendarEvents.ts)
- [src/lib/calendar/calendar.test.ts](../src/lib/calendar/calendar.test.ts)
- [src/lib/calendar/exportIdentity.test.ts](../src/lib/calendar/exportIdentity.test.ts)
- [src/lib/calendar/exportIdentity.ts](../src/lib/calendar/exportIdentity.ts)
- [src/lib/calendar/generateICS.ts](../src/lib/calendar/generateICS.ts)
- `src/lib/calendar/googleCalendarUrl.ts` — deleted; unmanaged Google template-link helper.
- [src/lib/calendar/ownership.ts](../src/lib/calendar/ownership.ts)
- [src/lib/calendar/repository.server.ts](../src/lib/calendar/repository.server.ts)
- [src/lib/google-calendar/database.server.ts](../src/lib/google-calendar/database.server.ts)
- [src/lib/google-calendar/errors.ts](../src/lib/google-calendar/errors.ts)
- [src/lib/google-calendar/events.server.ts](../src/lib/google-calendar/events.server.ts)
- [src/lib/google-calendar/ownership.server.ts](../src/lib/google-calendar/ownership.server.ts)
- [src/lib/google-calendar/plan.ts](../src/lib/google-calendar/plan.ts)
- [src/lib/google-calendar/recovery.server.ts](../src/lib/google-calendar/recovery.server.ts)
- [src/lib/google-calendar/removal.server.ts](../src/lib/google-calendar/removal.server.ts)
- [src/lib/google-calendar/removal.ts](../src/lib/google-calendar/removal.ts)
- [src/lib/google-calendar/remove-event.server.ts](../src/lib/google-calendar/remove-event.server.ts)
- [src/lib/google-calendar/session.server.ts](../src/lib/google-calendar/session.server.ts)
- [src/lib/google-calendar/sync-database.server.ts](../src/lib/google-calendar/sync-database.server.ts)
- [src/lib/google-calendar/sync-event.server.ts](../src/lib/google-calendar/sync-event.server.ts)
- [src/lib/google-calendar/sync.server.ts](../src/lib/google-calendar/sync.server.ts)
- [tests/integration/calendar-migration.test.ts](../tests/integration/calendar-migration.test.ts)
- [tests/integration/google-calendar.test.ts](../tests/integration/google-calendar.test.ts)
