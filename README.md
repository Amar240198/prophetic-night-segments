# Prophetic Night Segments

The canonical full-stack repository for a provider-agnostic night-segmentation engine. It divides a supplied interval from Maghrib to the following Fajr into six mathematically exact parts and three conventional thirds, while keeping prayer-time sourcing outside the mathematical engine.

The production-facing web application is the Next.js app at the repository root. It supports published and astronomical prayer-time providers, precise browser coordinates, trusted manual timetable input, demonstration fixtures, configurable alarm planning, and calendar export. Developer integration remains available through the typed engine, SDK, API routes, documentation, and examples rather than the end-user interface. The repository also contains provider adapters, integration and property tests, and a native SwiftUI reference app.

## Domain model

For absolute instants `M` (Maghrib) and `F` (following Fajr):

```text
D = F − M
Bᵢ = M + floor(D × i / 6), for i = 0…5
B₆ = F
```

Every boundary is derived independently from the original interval, avoiding cumulative rounding. Parts 1–3 are initial sleep, Parts 4–5 are the Dāwūd prayer period, and Part 6 is final sleep. Separately, Parts 5–6 are the mathematical last third. Parts 4–5 must not be described as the last third.

## Local development

Requirements: Node.js 22+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` for the canonical web application.

To run the standalone versioned API in a second terminal:

```bash
pnpm dev:api
```

The API is then available at `http://localhost:3001/api/v1`, with OpenAPI documentation at `http://localhost:3001/api/docs`.

The canonical Next.js deployment also exposes `POST /api/v1/night/calculate` and `POST /api/v1/night/calculate-from-coordinates`. Provider credentials, if a configured adapter requires them, remain server-side.

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build:all
```

## Engine example

```ts
import { calculateNightSegments } from "@prophetic-night/night-engine";

const result = calculateNightSegments({
  maghrib: "2026-07-23T21:02:00+01:00",
  fajr: "2026-07-24T03:15:00+01:00",
  timeZone: "Europe/London",
});
```

The pure engine does not call prayer providers, read the system timezone, choose prayer times, mutate input, or depend on the current clock. The timezone is explicitly supplied for validation and presentation; interval arithmetic uses absolute instants.

## Repository structure

```text
src                         Canonical Next.js web application and server route
apps/api                    Versioned Fastify REST API and OpenAPI UI
packages/night-engine       Deterministic calculation and validation engine
packages/shared-types       Typed public calculation contracts
packages/sdk                SDK exports and typed HTTP client
packages/prayer-providers   Replaceable and offline provider adapters
docs                        Architecture, policy, integration, and roadmap
examples                    Browser, Node, cURL, and React Native examples
tests                       API, geographic, and web-interface tests
ios                         Native SwiftUI reference implementation and tests
```

## Consolidation and package migration

This repository supersedes the former separate local prototype. All workspace packages now use the `@prophetic-night/*` scope. Integrators using a pre-release local build should update imports accordingly; calculation schemas and behavior remain unchanged.

There is one canonical web application: the root Next.js app. The previous Vite demonstration was intentionally not retained as a second runnable website; its manual-input, geolocation, alarm-planning, calendar-export, shared-engine, API, SDK, test, provider, documentation, example, and iOS capabilities were migrated or superseded here. Its developer-output panel was intentionally retired from the public interface.

## Religious framing

Ṣaḥīḥ al-Bukhārī 1131 describes the night pattern attributed to Prophet Dāwūd: half sleep, one third prayer, then one sixth sleep. With six parts this is `3/6 + 2/6 + 1/6`. Ṣaḥīḥ al-Bukhārī 1146 separately supports a general sleep → prayer → return to sleep → rise for Fajr structure for the Prophet Muhammad ﷺ; it does not establish an exact six-part schedule for his routine.

This software performs arithmetic on supplied times. It does not determine prayer times, issue fatāwā, determine worship validity, or replace qualified scholars. Verify prayer-time inputs with an appropriate trusted source.

### Qiyam calendar integration

The Calendar card below the calculation results exports selected events for the calculated
night. Choose a wake-up buffer (0, 5, 10, 15, 20, 30 minutes or a custom whole number
from 0–1440), then download the `.ics` file. Wake, last-third and Fajr events are
selected by default; final-sixth and prayer-window events are optional. Selecting the
Dāwūd view uses the existing Parts 4–5 prayer window and offers a go-back-to-sleep
event at Part 6. Other views use the existing last-third window (Parts 5–6). These
are optional personal scheduling choices, not additional religious claims.

`src/lib/calendar/buildCalendarEvents.ts` consumes the engine result without changing
its boundaries. Wake buffers are elapsed minutes and may move the wake event to the
previous date or before Maghrib. Previews and descriptions include the calculation's
IANA timezone, local date and UTC offset. Exports use absolute UTC instants, preserving
DST transitions, midnight rollover and fractional-hour timezone offsets. The engine
retains millisecond precision; calendar serialization truncates to whole seconds because
[RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html) does not support fractional
seconds. Boundary events have zero duration; the prayer event spans the actual window.
Invalid buffers raise `CalendarError` with code `INVALID_CALENDAR_BUFFER` and are
blocked with an inline message in the UI.

`generateICS.ts` provides CRLF delimiters, escaped text, UTF-8 line folding and stable
event identifiers. The existing alarm-planning download remains available and shares
this serializer. Calendar reminders depend on application notification settings; files
do not configure an audible alarm. Reimport behavior and duplicate handling vary by client.

For local verification, run `pnpm dev`, calculate a night, select events in the Calendar
card, adjust the buffer, and download the file. Import it into Apple Calendar, Google
Calendar (Settings → Import & export), or Outlook and compare the event dates/times
with the card, using the same display timezone. Try the Dāwūd view and a custom buffer
that crosses midnight. The Google Calendar disclosure provides one prefilled event
link per selection; review and save each event there. No Google authentication is
required by this app, though Google may require sign-in to save an event. This MVP is
a one-night export, not a subscription or automatic sync. Live imports into all calendar
clients require manual verification.
