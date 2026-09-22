# Calendar intelligence implementation map

Existing: Next.js 16 App Router/React 19, typed standalone night SDK and Fastify API; Neon PostgreSQL; password accounts with opaque server sessions; Google OAuth with state, PKCE, encrypted tokens and refresh; signed event ownership, leases and reconciliation; ICS exports; location/provider settings; routines, fasting, entitlements/trials and daily Vercel cron. No live payment checkout integration was found.

Partial: provider abstraction currently covers managed exports only; Google currently requests owned-event write access; calendar dashboard is a sync interface. Existing maintenance fencing also blocks OAuth/disconnect.

Missing: selected-calendar reading, normalized external events, prayer-period availability, explained recommendations, explicit read/write grant separation and protected-block preview.

Changes: extend Google OAuth/session/database modules and existing write boundary; add provider-neutral read models, Google read adapter, deterministic DailyTimeline and analysis service, authenticated intelligence routes and a dashboard component. Keep canonical prayer providers and night engine, API v1 and existing routes. Extend existing PostgreSQL connections/preferences instead of replacing them.

Migration 008: scopes and explicit management consent on existing connections; provider-neutral calendar selections; analysis settings on existing account preferences; mutation audit records. Existing ownership ledgers remain canonical for legacy sync.

Configuration: reuse DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI and GOOGLE_SESSION_SECRET (AES-GCM encryption). Add CALENDAR_WRITES_ENABLED=false; optional GOOGLE_CALENDAR_ENABLED, MIQAT_CONFLICT_ENGINE_ENABLED, MIQAT_RECOMMENDATIONS_ENABLED. Keep CALENDAR_MUTATIONS_PAUSED as an additional emergency fence.

Compatibility: read consent requires reconnection for old write-only grants. Writes fail closed unless explicitly enabled and management consent is stored. UTC instants drive interval arithmetic; civil dates use Temporal/IANA zones. Isha cutoff is explicitly configurable, with no claim that a scheduling policy resolves jurisprudential differences.
