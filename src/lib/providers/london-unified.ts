import { Temporal } from "@js-temporal/polyfill";
import { londonUnified2026 } from "./london-unified-2026";

export interface LondonUnifiedPrayerTimes {
  maghrib: { formatted: string; iso: string };
  fajr: { formatted: string; iso: string };
  timezone: "Europe/London";
  calculationMethod: "London Unified Prayer Timetable 2026";
  school: "Standard — Shafi, Maliki, Hanbali";
  source: "London Salah Timetable Unified Ulama Committee";
  dailyPrayerTimes: {
    serviceDate: string;
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asrStandard: string;
    asrHanafi: string;
    maghrib: string;
    isha: string;
  };
  followingDayPrayerTimes: {
    serviceDate: string;
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asrStandard: string;
    asrHanafi: string;
    maghrib: string;
    isha: string;
  };
}

function parseDate(value: string): Temporal.PlainDate {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error();
    return Temporal.PlainDate.from(value);
  } catch {
    throw new Error("Choose a real date in YYYY-MM-DD format.");
  }
}

function toPrayerTime(date: Temporal.PlainDate, clock: string) {
  const instant = Temporal.PlainDateTime.from(`${date}T${clock}:00`)
    .toZonedDateTime("Europe/London", { disambiguation: "reject" })
    .toInstant()
    .toString();
  return { formatted: clock, iso: instant };
}

export function getLondonUnifiedPrayerTimes(dateValue: string): LondonUnifiedPrayerTimes {
  const date = parseDate(dateValue);
  if (date.year !== 2026) {
    throw new Error("London Unified timetable data is currently available for 2026 only.");
  }
  const followingDate = date.add({ days: 1 });
  const day = londonUnified2026[date.toString().slice(5)];
  const followingDay =
    followingDate.year === 2026
      ? londonUnified2026[followingDate.toString().slice(5)]
      : undefined;
  if (!day || !followingDay) {
    throw new Error("London Unified does not cover the complete requested night.");
  }
  const [fajr, sunrise, dhuhr, asrStandard, asrHanafi, maghrib, isha] = day;
  const [
    followingFajr,
    followingSunrise,
    followingDhuhr,
    followingAsrStandard,
    followingAsrHanafi,
    followingMaghrib,
    followingIsha,
  ] = followingDay;
  return {
    maghrib: toPrayerTime(date, maghrib),
    fajr: toPrayerTime(followingDate, followingDay[0]),
    timezone: "Europe/London",
    calculationMethod: "London Unified Prayer Timetable 2026",
    school: "Standard — Shafi, Maliki, Hanbali",
    source: "London Salah Timetable Unified Ulama Committee",
    dailyPrayerTimes: {
      serviceDate: date.toString(),
      fajr,
      sunrise,
      dhuhr,
      asrStandard,
      asrHanafi,
      maghrib,
      isha,
    },
    followingDayPrayerTimes: {
      serviceDate: followingDate.toString(),
      fajr: followingFajr,
      sunrise: followingSunrise,
      dhuhr: followingDhuhr,
      asrStandard: followingAsrStandard,
      asrHanafi: followingAsrHanafi,
      maghrib: followingMaghrib,
      isha: followingIsha,
    },
  };
}
