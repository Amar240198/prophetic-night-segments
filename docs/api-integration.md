# API and SDK integration

An existing prayer application should keep its trusted prayer-time source. For each service date:

1. Obtain dated Maghrib and following-Fajr values.
2. Preserve their explicit offsets and IANA timetable timezone.
3. Pass them to `calculateNightSegments` locally or `POST /api/v1/night/calculate`.
4. Render `segments`, `thirds`, `lastThird`, and `dawudPattern` as separate layers.
5. Convert selected `AlarmPlan` instants into device-native notification requests.
6. Recalculate when the timetable, timezone, travel state, or provider method changes.

Cache by provider, service date, timezone, Maghrib instant, Fajr instant, calculation version, and relevant options. Invalidate when any key changes. Do not reconstruct offsets from a device timezone.

## Local clock provider data

If a provider returns local clock values, combine them with its service date and IANA timezone using Temporal with `disambiguation: "reject"`. An invalid or ambiguous local time must be resolved from provider metadata rather than guessed. The web app demonstrates this normalization.

## Environments

- **Node/server:** import `calculateNightSegments` from `@prophetic-night/night-engine`.
- **Browser/React:** calculate locally or call the versioned API; keep formatting outside the core.
- **React Native:** use the engine, then schedule native notifications from returned ISO instants. Recheck on timezone/app-state changes.
- **Existing prayer app:** implement `PrayerTimeProvider`, normalize its output, then call the engine.

The API uses `/api/v1`; additive fields may appear in a minor release, while removals or semantic changes require a new major API path and SDK major version.

Never assume a browser reminder survives closing. Device-native notification permissions and platform policies remain the integrating application's responsibility.

## Coordinate-sourced prayer times

`POST /api/v1/night/calculate-from-coordinates` accepts:

```json
{
  "latitude": 51.5074,
  "longitude": -0.1278,
  "serviceDate": "2026-07-23",
  "timeZone": "Europe/London",
  "calculationMethod": 3
}
```

Latitude is constrained to `[-90, 90]`, longitude to `[-180, 180]`, and `serviceDate` is the local civil date whose Maghrib begins the night. `timeZone` is required because coordinates alone do not safely define civil-date boundaries. The optional non-negative integer method is passed to the configured provider. The response is the normal night-calculation result plus `prayerTimes.provider`, `prayerTimes.calculationMethod`, and `prayerTimes.timeZone` provenance.

The coordinate calculation runtime defaults to `AlAdhanPrayerTimeProvider`. `IslamicAppPrayerTimeProvider` remains an explicitly injectable adapter. Both adapters send the caller's exact coordinates and explicit IANA timezone; the AlAdhan adapter uses `timezonestring` and rejects a response whose timezone differs, rather than accepting AlAdhan's coordinate-based timezone inference. Deployments can inject any implementation of `PrayerTimeProvider`; switching or falling back silently between calculation methods is prohibited.

The bundled London Unified static timetable and `LondonUnifiedPrayerTimeProvider` export have been removed. Coordinate requests support only `prayerTimeSource: "coordinates"` (or omission). Requests naming `london-unified` now return `INVALID_REQUEST`; the city endpoint returns `INVALID_SOURCE`. SDK consumers must use a supported provider or supply trusted Maghrib/Fajr through the manual calculation API. The night engine's precision and timezone policies are unchanged.

Provider failures use stable transport codes: `INVALID_PROVIDER_INPUT` (400), `INVALID_PROVIDER_RESPONSE` (502), and `PROVIDER_UNAVAILABLE` (503). Do not silently retry with a different prayer-time method.

## Precise-location provider correction

The deployed coordinate route previously returned `PROVIDER_UNAVAILABLE` through islamic.app while city lookup used AlAdhan successfully. New coordinate calculations now use AlAdhan directly, preserving full coordinate precision, the supplied IANA timezone, and consecutive local service dates. This is a default-provider change, not an automatic fallback. New calendar coordinate sources include `provider: "aladhan"`; saved sources without this field retain islamic.app. Provider outages return HTTP 503 and a safe retry/manual-input message; malformed provider responses return 502; invalid client input returns 400. Browser location denial, timeout, and unavailable-position errors remain separate from provider failures.
