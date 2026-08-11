# Sixth of the Night

A Next.js demonstration of six mathematically exact night portions, three
conventional thirds, and the Dāwūd night pattern. Prayer-time sourcing and
night segmentation are separate: the provider supplies Maghrib and following
Fajr, and the unchanged pure calculation function divides that interval.

## Local setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Start the app:

   ```bash
   pnpm dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

Choose a city, AlAdhan calculation method, and Asr juristic method. The app
fetches today's Maghrib and the following day's Fajr and passes only those two
ISO instants into the segmentation function. No API key is required.

## Provider example

```ts
import { fetchAlAdhanPrayerTimes } from "@/lib/providers/aladhan";

const prayerTimes = await fetchAlAdhanPrayerTimes({
  city: "London",
  country: "United Kingdom",
  date: "2026-08-03",
  calculationMethod: 3,
  school: 0,
  adjustment: 0, // Optional Hijri-date adjustment (-2 through 2).
  timeout: 10_000, // Optional milliseconds per request attempt.
});

// Existing engine inputs (absolute ISO timestamps):
calculateNightSegments(prayerTimes.maghrib.iso, prayerTimes.fajr.iso);
```

Change `city` and `country` for the user's location, `date` for the Maghrib
service date, `calculationMethod` for the user's authority (3 is Muslim World
League), and `school` for the juristic setting (0 is Shafi/Maliki/Hanbali; 1 is
Hanafi). `maghrib.formatted` and `fajr.formatted` are UI values; their `iso`
values are the unambiguous inputs intended for calculations.

## Checks

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

## Important framing

The display is an informational scheduling visualisation based on the night
pattern attributed to Prophet Dāwūd in Ṣaḥīḥ al-Bukhārī 1131. It is not a
religious ruling and does not present this optional pattern as compulsory.
