# Miqāt calendar intelligence

The existing Next.js calendar page (`/app/calendar`) now reads Google calendars and combines them with the canonical prayer providers and Sixth of the Night engine. No calculation API v1 schema changes. The timeline API is additive and currently processes one selected civil day, including the following Fajr, with transient event contents. The read adapter supports bounded ranges up to 32 days and paginates expanded recurring instances. A selected calendar failure makes availability UNKNOWN, never CLEAR.

## Rollout

Apply `migrations/008_calendar_intelligence.sql` after 001–007, before deploying this version. It adds connection grant/management state, calendar preferences, prayer analysis settings and a minimal mutation audit. It does not delete existing event ledgers or tables. Existing connections have management OFF and must reconnect for the new read scope. Read-only deployments leave `CALENDAR_WRITES_ENABLED=false`. Missing or unrecognised values also disable writes. `CALENDAR_MUTATIONS_PAUSED=true` is an additional legacy write fence. Both are enforced in the central mutation service, including cron and old sync/remove routes.

Reuse `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_SESSION_SECRET`, `DATABASE_URL`. No new encryption secret: existing AES-GCM/HKDF token storage remains canonical. Optional flags default on: `GOOGLE_CALENDAR_ENABLED`, `MIQAT_CONFLICT_ENGINE_ENABLED`, `MIQAT_RECOMMENDATIONS_ENABLED`; set exactly `false` to disable. The latter two never enable writes.

Google configuration for the linked Vercel project **sixth-of-the-night**:

1. Open https://console.cloud.google.com/apis/library/calendar-json.googleapis.com and enable **Google Calendar API** in the existing credential project.
2. Open https://console.cloud.google.com/auth/scopes and add `https://www.googleapis.com/auth/calendar.readonly`. Keep `userinfo.email` for the existing verified account identity. Add `https://www.googleapis.com/auth/calendar.events` for explicit management upgrades. Initial connection requests read access and email only; old owned-event scope is no longer requested.
3. Open https://console.cloud.google.com/auth/clients. Edit the existing **Web application** OAuth client (create one only if absent). Register `https://sixth-of-the-night.vercel.app/api/google-calendar/callback`. Local: `http://localhost:3000/api/google-calendar/callback`.
4. In Vercel → sixth-of-the-night → Settings → Environment Variables → Production, verify the existing client ID/secret and set `GOOGLE_OAUTH_REDIRECT_URI` to that production callback, `CALENDAR_WRITES_ENABLED=false`, and the optional flags to `true`. Retain the existing session encryption secret and database URL. Environment changes require redeployment. Changing Google scope configuration alone does not deploy application code; users must reconnect to grant read consent.
5. Under Google Auth Platform → Audience, include the acceptance-test account while the app remains in Testing. Public rollout requires the appropriate Google verification process.

Reference: [Google scope definitions](https://developers.google.com/workspace/calendar/api/auth), [expanded bounded event retrieval](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

## API and deterministic policies

All intelligence endpoints sit under `/api/google-calendar/intelligence` so the existing scoped HttpOnly Google cookie remains compatible. App authentication is also required, and the Google connection must belong to that app user. POST requests require the configured exact Origin and bounded JSON.

- `GET/POST calendars`: list and atomically replace the enabled read selection; maximum ten calendars, verified against provider access.
- `GET/POST preferences`: validated prayer duration, before/after meeting buffers, protection mode and Isha cutoff.
- `POST timeline`: `{date:"YYYY-MM-DD",source:SyncSource}`. Returns typed DailyTimeline, normalized events, prayer windows, available intervals, ranked recommendations, reasons and canonical night result.
- `POST prayer-block`: same timeline input plus `prayer`, `calendarId`, optional `operation` (`create`, `update`, `delete`). Returns a five-minute signed preview.
- `POST prayer-block?action=confirm`: repeat the preview input plus its `token`. Revalidates ownership, consent, preference, events and proposed slot; stale changes fail with `EVENT_CHANGED`.
- `POST management`: disable local management while preserving read access.
- Existing `GET /api/google-calendar/connect`: read OAuth. `POST` at the same path explicitly upgrades management via CSRF-protected consent. Existing disconnect revokes provider access after invalidating credentials and selections.

Windows: Fajr→Sunrise, Dhuhr→Asr, Asr→Maghrib, Maghrib→Isha. Isha scheduling cutoff defaults to the Islamic night midpoint and can be changed to next Fajr. These are disclosed scheduling policies, not a comprehensive fiqh engine. Asr remains supplied by the existing provider/madhhab configuration. Invalid/non-increasing intervals fail safely. No timezone-derived location guesses.

Busy intervals are half-open UTC instants. Cancelled and transparent events do not block time; tentative events conservatively block. All-day dates use the calendar IANA timezone and exclusive end date, including 23/25-hour DST dates. Overlapping busy intervals merge before subtraction. Before-meeting buffers expand meeting starts; after-meeting buffers expand ends. Usable slots meet the requested uninterrupted duration. Recommendations rank earliest-first; no meeting is rescheduled. PROTECTED requires verified Miqāt metadata, sufficient duration, and no conflicting external busy interval.

The provider-neutral models are separate from historical ICS/export CalendarEvent types to preserve their public interfaces. The existing management adapter remains the reconciliation contract. New providers normalize into the same read model; authentication and mutation orchestration remain server-side.

## Mutation and privacy guarantees

`src/lib/calendar/mutation.server.ts` is the only remote event write transport. It checks fail-closed flags, live connection state, management opt-in, write scope and lease before writing. It records intent before provider access and outcome afterward; interrupted operations remain investigable. Audit stores connection/user, operation, calendar/event/entity IDs and start/end states, never tokens, titles, attendee data or descriptions. Existing managed event code retains signed ownership/ETag checks. Prayer blocks have deterministic IDs bound to user, connection, calendar, prayer and date, signed ownership metadata, and ETag checks for update/delete. Duplicate retries return the existing matching event. User-created meetings cannot be mutation targets.

Events are retrieved with a minimal fields projection and are not durably cached. Descriptions, attendees and organizer data are not requested. Calendar list caching is per request; prayer results use a bounded five-minute in-memory cache separate from events. Refresh on returning to the tab, date/source changes and every five minutes fetches current events. Confirmation always fetches again. Disconnect erases encrypted credentials, selection and management consent, clears sessions and stops sync eligibility before attempting revocation. Existing external events and audit/ownership ledgers remain for investigation and safe reconnection. Define an operational audit retention period and apply database access controls; no indefinite event-content store is introduced.

## Reconciliation, routines and entitlements

AUTO_MAINTAIN remains unavailable for intelligent protected blocks. Existing automatic rolling sync keeps its existing trial/entitlement checks and signed ownership reconciliation, and is disabled by the global write fence. Do not activate it until read acceptance and explicit write acceptance succeed. A later protected-block reconciler should use a rolling 7–30 day horizon, regenerate canonical DailyTimeline for each day, and preview changes to verified Miqāt identities only. Webhooks/incremental tokens are deferred; do not treat a stale frontend preview as authority.

Existing Qiyām/night selection, relative routines, Monday/Thursday/white-day/Dāwūd fasting controls and ICS exports remain available. Night segmentation in intelligence uses the same engine; Parts 4–5 are the Dāwūd prayer period, Parts 5–6 the mathematical last third. Existing civil Hijri conversion is informational and replaceable by a local lunar calendar provider; Ramadan/local moon-sighting guidance must use that boundary rather than claiming arithmetic dates are universally authoritative.

The existing plan/trial tables remain the billing boundary; no checkout provider or price is introduced. Read intelligence is available to signed-in users for this read-only rollout. Existing paid automation entitlement remains separate from OAuth and conflict analysis. Commercial gating can use feature entitlements without changing provider or mathematical code.

## Microsoft and Apple

Microsoft Graph should implement the read adapter with delegated `Calendars.Read`, and request `Calendars.ReadWrite` only on explicit management upgrade. Map expanded calendarView instances to UTC start/end, preserving original zones; convert Windows zones at that adapter boundary. Reuse account authorization, selected calendars, timeline, preview, audit and idempotency contracts. No Microsoft network integration is claimed in this release.

Apple web integration remains ICS subscription/export; it cannot read a user's Apple calendar through Google-like OAuth. Native iOS can implement EventKit with explicit read/full-access permissions and normalize device events. EventKit authorization stays on-device; web server credentials are not invented. The existing iOS engine and ICS routes are unchanged.

## Production acceptance and operations

Before enabling writes: signed-in read consent; calendar selection; real recurring/all-day/busy events; accurate prayer/night timeline; conflict and recommendation comparison against real events; all legacy/current write routes return `CALENDAR_WRITES_DISABLED`; calculation routes and ICS still work. Then separately test explicit write consent and a confirmed disposable prayer block, repeat confirmation (one event), preview update/delete, and disconnect. Do not enable production writes automatically after deployment. Live OAuth requires an account holder to complete Google's consent screen; mocks do not establish live acceptance.

At the edge apply per-account/IP read limits and Google quota monitoring without logging OAuth codes or personal schedules. No raw provider errors or stack traces are exposed. A Google failure leaves the public prayer and Sixth calculation paths available. Consider provider webhooks only once bounded daily reads and acceptance are stable.

## Timetable correction

The former bundled London Unified timetable and its dataset-parity test have been removed. Analysis uses the selected live provider. Existing exported calendar entries are not automatically rewritten.
