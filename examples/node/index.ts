import { calculateNightSegments } from "@prophetic-night/night-engine";

const result = calculateNightSegments({
  maghrib: "2026-07-23T21:02:00+01:00",
  fajr: "2026-07-24T03:15:00+01:00",
  timeZone: "Europe/London",
});
console.log(result.segments);
