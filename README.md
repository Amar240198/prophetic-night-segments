# Prophetic Night Segments

The canonical full-stack repository for a provider-agnostic night-segmentation engine. It divides a supplied interval from Maghrib to the following Fajr into six mathematically exact parts and three conventional thirds, while keeping prayer-time sourcing outside the mathematical engine.

The production-facing web application is the Next.js app at the repository root. The repository also contains a pure TypeScript engine, stable shared types, a typed SDK, provider adapters, a versioned Fastify API, integration and property tests, documentation, examples, and a native SwiftUI reference app.

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

There is one canonical web application: the root Next.js app. The previous Vite demonstration was intentionally not retained as a second runnable website; its shared engine, API, SDK, tests, providers, documentation, examples, and iOS capabilities were migrated here.

## Religious framing

Ṣaḥīḥ al-Bukhārī 1131 describes the night pattern attributed to Prophet Dāwūd: half sleep, one third prayer, then one sixth sleep. With six parts this is `3/6 + 2/6 + 1/6`. Ṣaḥīḥ al-Bukhārī 1146 separately supports a general sleep → prayer → return to sleep → rise for Fajr structure for the Prophet Muhammad ﷺ; it does not establish an exact six-part schedule for his routine.

This software performs arithmetic on supplied times. It does not determine prayer times, issue fatāwā, determine worship validity, or replace qualified scholars. Verify prayer-time inputs with an appropriate trusted source.
