# Architecture

## Boundaries

The monorepo separates three concerns:

1. `prayer-providers` sources and normalises Maghrib/Fajr. The open-source `islamic.app` adapter is the runtime default; AlAdhan is available only as an explicitly configured alternative. Both are replaceable and confined to this layer.
2. `night-engine` validates and segments the supplied absolute interval.
3. API and web layers transport and present the result.

The engine imports no provider or UI. It uses the Temporal polyfill for standards-based ISO instant validation, while `Intl.DateTimeFormat` handles locale-aware presentation. An explicit IANA timezone is always required. The core never reads the machine's timezone.

`calculateNightSegments` is deterministic and side-effect free. Calculation metadata uses the supplied Fajr instant as a deterministic result timestamp; a hosted transport may add a separate request timestamp if needed.

## Precision

Epoch milliseconds are integers. Boundary `i` is `start + floor(total × i / 6)`, independently derived. The small remainder is therefore distributed deterministically among segments, there are no gaps or overlaps, and B6 equals Fajr exactly. See [calculation-method.md](calculation-method.md).

## API and application

Fastify supplies schema validation, a 16 KiB request limit, secure headers, an explicit development CORS allow-list, sanitised errors, and OpenAPI. `/api/v1/night/calculate` accepts already-supplied instants. `/api/v1/night/calculate-from-coordinates` validates latitude, longitude, service date, and calculation method, asks the configured provider for two civil dates, and then passes only normalised instants to the engine. React/Vite supplies a responsive client and calls the same REST API used by licensees. Development proxying avoids a second browser origin.

## Production hardening

Before a public deployment: terminate TLS at a trusted edge, configure exact origins, add per-client rate limits, structured request IDs, availability monitoring, dependency scanning, a response-schema compatibility gate, and data-retention policy. Do not log submitted timetable inputs, coordinates, or location labels by default. Disclose that coordinates are sent server-side to the configured prayer-time provider. Provider secrets must be server-only environment variables and validated during startup.
