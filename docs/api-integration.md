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

The runtime default is the open-source `islamic.app` API. `AlAdhanPrayerTimeProvider` is retained as an opt-in adapter and is never selected implicitly. Both adapters send the caller's exact coordinates and explicit IANA timezone; the AlAdhan adapter uses `timezonestring` and rejects a response whose timezone differs, rather than accepting AlAdhan's coordinate-based timezone inference. Deployments can inject any implementation of `PrayerTimeProvider`; switching or falling back silently between calculation methods is prohibited.

For London users, `prayerTimeSource: "london-unified"` explicitly selects the bundled 2026 London Unified Prayer Timetable published by the London Salah Timetable Unified Ulama Committee. It requires `Europe/London`, returns the complete published prayer day (including both Asr conventions), and uses that day's Maghrib plus the following day's Fajr for segmentation. It never falls back to an astronomical method. The annual dataset must be replaced and re-verified against the committee's publication before enabling a later year. The timetable's published coverage is London within the M25; clients must not select it for other locations.

Provider failures use stable transport codes: `INVALID_PROVIDER_INPUT` (400), `INVALID_PROVIDER_RESPONSE` (502), and `PROVIDER_UNAVAILABLE` (503). Do not silently retry with a different prayer-time method.
