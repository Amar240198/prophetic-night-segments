# Google Calendar forward sync

The calendar card offers **Sync calendar for: 30 days / 60 days / 90 days / Continuous**
using radio choices, followed by one explicit sync action. One-night export remains available. It uses the prayer source and settings
captured by the last successful calculation, starting on the displayed local night
date, inclusive. Changing form fields without calculating again does not silently
change that source. Choose the current local date to sync the next selected number of nights.

Fixed modes populate 30, 60, or 90 nights. Continuous initially populates a bounded
90-night forward horizon and persists the rolling preference. The UI explicitly states
that automatic renewal is not enabled yet; no cron, worker, or background execution is
installed. Preferences are saved when the user presses Sync, even if some events later
fail, and the saved mode is restored from the session endpoint on return. An unsaved
radio choice is not overwritten by subsequent connection checks.

Select the desired Google event types, connect Google Calendar, review the start date,
and press the sync button once. The server performs the whole operation. The page
announces progress and reports the number of fully synced nights; dated event results
identify failures. Retry the same dates after a partial or interrupted run. There is
no automatic rolling sync, cron job, subscription, or background worker. Keep the page
open until a result appears. A lost response can leave saved events; retry is safe.

## Calculation and coverage

For each local date D, the server obtains Maghrib on D and Fajr on D + 1 using the
existing provider adapter. It checks that the returned instants belong to those local
dates, then calls `calculateNightSegments` and `buildGooglePlan`. No clock time is
copied from another night. Calendar-date iteration uses Temporal, and segmentation
uses elapsed absolute time, preserving DST, month/year transitions and fractional-hour
timezone offsets. The mathematical engine remains provider-independent.

Supported sources are London Unified's published timetable, AlAdhan city lookup with
its captured method/school/tuning settings, and islamic.app coordinate lookup with its
captured method and timezone. Manual inputs and demonstration fixtures describe only
one night and cannot supply a forward horizon. London Unified currently covers 2026
only and cannot supply Fajr for 1 January 2027. Uncovered or unusable nights are reported
as `PRAYER_TIMES_UNAVAILABLE`; the server never substitutes another source or repeats
old times. Provider availability and published coverage limit achievable sync results.

Only selected event types are created. Wake buffers, Dāwūd versus last-third planning,
Fajr preparation, and enabled Wake before Fajr offsets are retained for every night. Boundary
markers last one minute in Google; calculation boundaries retain engine precision.
The general prayer-window and final-sixth selections are also available. Parts 4–5
remain the Dāwūd prayer window and are never called the mathematical last third.

## Persistence and duplicate prevention

Migration `002_google_calendar_event_mappings.sql` adds:

- `google_calendar_event_mappings`: connection/account + local night date + event type,
  primary calendar, Google event ID, last confirmed payload hash, and sync timestamp.
- `google_calendar_sync_leases`: one expiring sync lease per connected account, preventing
  overlapping syncs from different tabs, sessions, or serverless instances.

The same migration 002 also creates `google_calendar_sync_preferences` with account-scoped preferences:
`sync_mode` (`fixed` or `continuous`), numeric `horizon_days`, the requested start date,
provider configuration, selected event types, planning offsets, configuration version,
and update timestamp. Fixed 90 days and Continuous 90 days are distinct records by mode.
The numeric column supports additional horizons without restructuring the schema;
application validation controls which horizons are currently offered.

Preferences are saved under the existing account lease before Google writes. Extending
30 → 60 → 90 reuses the same account/date/type mappings. Shortening 90 → 30, switching
Continuous to fixed, or deselecting types never deletes prior Google events. Only the
requested dates/types are reconciled. No deletion operation is part of horizon changes.

A future explicitly authorized worker can select only Continuous preferences, resolve
the local current date from the saved provider, validate the versioned configuration,
refresh credentials server-side, and reuse calculation/mapping logic under the same
account lease. No schedule or automatic execution exists in this implementation.
Disconnect cascades preferences away, removing future worker eligibility. Reconnection
does not silently re-enable Continuous; a new explicit sync choice is required.

All three tables from migration 002 reference `google_connections` and cascade on disconnect. Browser sessions
resolve their connection server-side; clients cannot choose an account or Google ID.
A deterministic SHA-256 event ID is derived from the Google subject, local night, and
event type. It stays stable when calculated times, offsets, or browser sessions change,
including reconnecting to the same Google account. IDs do not contain raw account data.
Mappings are reserved before Google writes, then confirmed after success.

Each retry reads the mapped deterministic event. Matching payloads are skipped; changed
calculated payloads update only app-owned event fields using an ETag precondition.
An uncertain insert response is recovered by the next lookup; a 409 insert conflict is
also verified before proceeding. Foreign events are never overwritten and cancelled
events are not resurrected. A failed mapping confirmation is reported as failure even
if Google saved the event; retry reconciles it. Deselecting a type does not delete events
from previous runs. The legacy one-night endpoint and manually saved links/ICS imports
retain their existing identities; the forward-sync mappings do not retroactively merge
those independently exported events.

Google reference: [client-supplied event IDs](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
and [partial event updates](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch).

## API

`POST /api/google-calendar/sync` requires the existing HttpOnly session cookie, JSON
content type, and the exact configured same-origin `Origin` header. Maximum request
body: 64 KiB. No new OAuth scope or credential is needed.

Example body (London Unified):

```json
{
  "startDate": "2026-09-09",
  "mode": "fixed",
  "nights": 30,
  "source": { "kind": "london-unified" },
  "selected": ["last-third", "final-sixth", "prayer", "fajr"],
  "options": {
    "wakeBufferMinutes": 15,
    "dawudSelected": false,
    "fajrPreparationMinutes": 20,
    "firstAdhanMinutes": null
  }
}
```

The shared types in `src/lib/google-calendar/sync.ts` document the request, source,
preference, and result contracts. New fixed requests use `mode: "fixed"` and `nights`
of 30, 60, or 90. Continuous requests use `mode: "continuous"`; `nights` must match the
configured rolling horizon (initially 90) or be omitted to use that server default.
Unknown modes, unrestricted numbers, string horizons, and a conflicting Continuous
horizon are rejected. For compatibility, requests omitting `mode` retain the previous
1–30-night fixed API and also accept the new fixed choices; there is no free-text UI.

`FIXED_SYNC_HORIZONS` and `CONTINUOUS_SYNC_NIGHTS` control allowed choices and the initial
rolling horizon separately. Raising them later requires revisiting execution budgets
and quotas, not changing date arithmetic or the database shape. The session endpoint
adds `syncPreference: { mode, horizonDays }` (or null) without exposing saved location,
provider configuration, account identifiers, or credentials.

A completed request returns HTTP 200 with `nights`, `syncedNights`, and an `outcomes`
entry per selected type per date. Status is `created`, `updated`, `existing`, or `failed`;
failures carry a stable safe error code. `syncedNights` counts only nights where every
selected event succeeded. HTTP 200 alone does not imply all events succeeded. Validation,
authentication, database setup, and lease acquisition failures use the existing safe
error envelope; `SYNC_IN_PROGRESS` returns 409. No credentials or database IDs are returned.

## Limits and failures

At most three nights are processed concurrently, with events sequential within each
night and 300 ms pacing between events. Results retain local-date ordering. Quota (429
or Google quota-related 403), permission, and session errors stop starting further events;
already-in-flight operations may finish. Remaining events are marked failed/not attempted. Other per-event errors permit subsequent
events to proceed. Quota errors require a later explicit retry; there is no immediate
retry loop. Access tokens are checked/refreshed through the existing session reader
between nights. A disconnect or changed connection stops new work; already-in-flight
Google requests may finish. Cascaded mappings prevent further event reservations.

The route requests a 300-second platform duration. Work has a shorter bounded deadline
and reserves time for network/database operations and returning partial results. Slow
providers or Google responses may produce `SYNC_INCOMPLETE`; retry safely completes
remaining work. The account lease expires after five minutes if execution is terminated.
Ensure the deployment supports the requested function duration before release. Per-account
mutual exclusion and bounded requests reduce bursts, but distributed request rate limiting,
quota monitoring, and retention policies remain production-hardening requirements.

## OAuth completion recovery

The completion page still posts only to its own origin and closes when an opener exists.
The parent validates both exact origin and popup window identity. It never treats a
message alone as authentication: only `/api/google-calendar/session` establishes the
connected state. Polling continues after a success message until the server confirms it.
Popup closure triggers verification, with a short grace period for cookie propagation.
Focus and visibility restoration also recheck the session, including after browser
isolation or tab suspension. Checks are serialized to avoid stale-response races.

The UI announces **Google Calendar connected**, leaves the waiting state automatically,
and offers useful closure/timeout errors. The overall OAuth wait is bounded to ten
minutes. “Check connection” remains an optional fallback, not a required step.

## Rollout — requires explicit production approval

Migration 001 and migration 002 have been applied to Production Neon, and all five
tables have been verified. Do not reapply migration 002 to that database. Its event
mappings, leases, and sync preferences are consolidated into one transaction.
For a new database, apply migration 001 first, then, after approval, apply only
migration 002 using a securely loaded `DATABASE_URL`:

```sh
PGDATABASE="$DATABASE_URL" psql -X --set=ON_ERROR_STOP=1 --file=migrations/002_google_calendar_event_mappings.sql
```

This transactional, additive migration does not modify existing connections or sessions.
It deliberately fails if its tables already exist. Back up the database per your normal
policy. Apply 002 before deploying this code; the previous deployment remains compatible
with the extra tables. Do not roll back the tables while sync-capable code is serving.
No migration is run automatically on startup or build. Automated tests apply both SQL
files only to isolated in-memory PostgreSQL and mock all Google/provider network calls.
After approved migration and deployment, validate 30 → 60 → 90, repeat the same range to confirm skips,
then verify that Continuous saves a distinct preference and shows no promise of automatic
renewal. Confirm the visible OAuth connected state and disconnect removal of preferences.

## Explicit event removal

The checked event types now drive both addition and removal. **Remove selected events (X)**
next to the one-night Add button removes only the displayed night: the server checks the
existing one-night identity at the displayed times and, when a local night is supplied,
that night's persistent mappings. A changed legacy one-night time has a different identity;
select the original times to remove that older export. Manually saved links and ICS imports
without our identity and private ownership markers are not removed.

**Remove from synced horizon (30/60/90 nights)** is a separate action. Continuous uses its
initial 90-night horizon. The confirmation states the starting date, number of nights,
selected types, and maximum number of mapped events affected. Dates are inclusive and use
calendar-date arithmetic, independent of current provider availability or changed prayer
times. Horizon removal never searches the calendar for events: only account/date/type
mappings in the requested range can identify deletion targets. Dates and types outside
that range remain untouched, including unmapped one-night exports.

For an existing event, removal verifies the exact event identity and private application,
event-type, and (for mappings) local-night markers before sending an ETag-conditional
DELETE. An ownership mismatch or ETag change is a failure, never permission to delete.
A 404, 410, or cancelled tombstone is treated as already absent. Only a successful deletion
or confirmed absence permits mapping removal. A network failure or failed mapping cleanup
is reported as failure; retry reconciles the remaining mapping. Results distinguish
removed, already absent, and failed/not-attempted identities without returning Google IDs.

Google documents [conditional deletion with If-Match](https://developers.google.com/workspace/calendar/api/guides/version-resources)
and [event deletion](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete).

Horizon removal first subtracts the checked types from the persisted `selected_event_types`
under the account lease, including when some subsequent deletions fail. Remaining types,
mode, horizon, and provider settings are retained. If no types remain, the preference row
is deleted, disabling future replay eligibility; this avoids changing migration 002's
nonempty-selection constraint. One-night removal deliberately leaves horizon preferences
unchanged, so a subsequent explicit horizon sync can attempt that night's selected types.

The session and successful sync/removal responses expose `syncSelection: { selected,
revision }`. The revision is an opaque string, or null when no preference exists. The UI
restores saved selections and unchecks horizon-removal targets even if a response is lost.
A captured retry action retains the removal scope independently of those checkboxes.
An explicit new checkbox selection is required to include a removed type again. Existing
Google trash/tombstone behavior is preserved: stable identities are not rotated to bypass
trash, and restoring a deleted event in Google may be necessary before adding that same
identity again.

Clients should send the last observed `selectionRevision` on sync and horizon removal.
A mismatch returns `SELECTION_CHANGED` (409) before preferences or Google events change.
Reload the session and review selections before retrying. This prevents a stale tab from
silently undoing removal. The optional field is additive: legacy clients omitting it retain
explicit-replacement semantics for their supplied selection; they should adopt revision
checking before implementing saved-selection replay. No automatic renewal runs.

`POST /api/google-calendar/remove` uses the same bounded JSON body, same-origin validation,
HttpOnly session, and primary calendar as sync. Supported request bodies:

```json
{
  "scope": "horizon",
  "startDate": "2026-09-10",
  "mode": "continuous",
  "nights": 90,
  "selected": ["final-sixth"],
  "selectionRevision": null
}
```

For one-night removal, send `scope: "night"`, `events` using the existing validated
one-night event schema, and optional `startDate` identifying the displayed local night.
Omitting `startDate` restricts removal to legacy one-night identities. Clients cannot
supply Google event IDs, account IDs, arbitrary calendars, or provider URLs.

Responses use the typed `RemovalResult` contract in `src/lib/google-calendar/removal.ts`.
HTTP 200 may contain partial failures; inspect every outcome. The new safe errors are
`REMOVE_FAILED`, `EVENT_NOT_OWNED`, `EVENT_CHANGED`, `REMOVE_INCOMPLETE`, and
`SELECTION_CHANGED`. No credential or internal exception is returned.

Removal, forward sync, and one-night insertion all share the existing account lease.
Removal runs at most three targets concurrently, rechecks the session before each target,
paces Google operations, and stops starting work on quota/authentication failures or the
bounded deadline. Already-in-flight operations may finish. No new database migration,
OAuth scope, cron, or background process is required. Production rollout still requires
explicit authorization; implementation tests use isolated PostgreSQL and mocked Google calls.
