import { Temporal } from "@js-temporal/polyfill";

export const ALADHAN_CALCULATION_METHODS = {
  0: "Shia Ithna-Ashari",
  1: "University of Islamic Sciences Karachi",
  2: "ISNA",
  3: "Muslim World League",
  4: "Umm al-Qura",
  5: "Egyptian General Authority",
  7: "Institute of Geophysics Tehran",
  8: "Gulf Region",
  9: "Kuwait",
  10: "Qatar",
  11: "Majlis Ugama Islam Singapore",
  12: "Union Organization France",
  13: "Diyanet Turkey",
  14: "Spiritual Administration of Muslims of Russia",
  15: "Moonsighting Committee Worldwide",
  16: "Dubai",
  17: "JAKIM, Malaysia",
  18: "Tunisia",
  19: "Algeria",
  20: "Kementerian Agama Republik Indonesia",
  21: "Morocco",
  22: "Comunidade Islâmica de Lisboa",
  23: "Ministry of Awqaf, Jordan",
  99: "Custom method",
} as const;

export const ALADHAN_SCHOOLS = {
  0: "Shafi / Maliki / Hanbali",
  1: "Hanafi",
} as const;

export type AlAdhanCalculationMethod = keyof typeof ALADHAN_CALCULATION_METHODS;
export type AlAdhanSchool = keyof typeof ALADHAN_SCHOOLS;

export interface FetchAlAdhanPrayerTimesOptions {
  city: string;
  country: string;
  state?: string;
  /** Gregorian service date in YYYY-MM-DD format. */
  date: string;
  calculationMethod: AlAdhanCalculationMethod;
  school: AlAdhanSchool;
  latitudeAdjustmentMethod?: 1 | 2 | 3;
  midnightMode?: 0 | 1;
  shafaq?: "general" | "ahmer" | "abyad";
  tune?: readonly [number, number, number, number, number, number, number, number, number];
  methodSettings?: readonly [number | null, number | null, number | null];
  /** AlAdhan Hijri-date adjustment, passed through to the API. */
  adjustment?: number;
  /** Request timeout in milliseconds. Defaults to 10 seconds per attempt. */
  timeout?: number;
}

export interface PrayerTime {
  /** Local, UI-ready 24-hour time in the location's timezone. */
  formatted: string;
  /** Absolute ISO 8601 timestamp for calculations. */
  iso: string;
}

export interface AlAdhanPrayerTimes {
  maghrib: PrayerTime;
  fajr: PrayerTime;
  timezone: string;
  calculationMethod: string;
  school: string;
  source: "AlAdhan API";
  dailyPrayerTimes: {
    serviceDate: string;
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    midnight: string;
  };
  followingDayPrayerTimes: {
    serviceDate: string;
    fajr: string;
    sunrise: string;
    dhuhr: string;
    asr: string;
    maghrib: string;
    isha: string;
    midnight: string;
  };
}

interface AlAdhanDay {
  timings: {
    Fajr: string;
    Sunrise: string;
    Dhuhr: string;
    Asr: string;
    Maghrib: string;
    Isha: string;
    Midnight: string;
  };
  date: { gregorian: { date: string } };
  meta: { timezone: string };
}

const BASE_URL = "https://api.aladhan.com/v1/timingsByCity";
const DEFAULT_TIMEOUT_MS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseResponse(value: unknown): AlAdhanDay {
  if (!isRecord(value) || value.code !== 200 || !isRecord(value.data)) {
    const status = isRecord(value) && typeof value.status === "string" ? `: ${value.status}` : "";
    throw new Error(`AlAdhan returned an unsuccessful response${status}`);
  }

  const { data } = value;
  const timings = data.timings;
  const date = data.date;
  const meta = data.meta;
  if (
    !isRecord(timings) ||
    typeof timings.Fajr !== "string" ||
    typeof timings.Sunrise !== "string" ||
    typeof timings.Dhuhr !== "string" ||
    typeof timings.Asr !== "string" ||
    typeof timings.Maghrib !== "string" ||
    typeof timings.Isha !== "string" ||
    typeof timings.Midnight !== "string" ||
    !isRecord(date) ||
    !isRecord(date.gregorian) ||
    typeof date.gregorian.date !== "string" ||
    !isRecord(meta) ||
    typeof meta.timezone !== "string"
  ) {
    throw new Error("AlAdhan returned an invalid prayer-times payload");
  }

  return {
    timings: {
      Fajr: timings.Fajr,
      Sunrise: timings.Sunrise,
      Dhuhr: timings.Dhuhr,
      Asr: timings.Asr,
      Maghrib: timings.Maghrib,
      Isha: timings.Isha,
      Midnight: timings.Midnight,
    },
    date: { gregorian: { date: date.gregorian.date } },
    meta: { timezone: meta.timezone },
  };
}

function parseServiceDate(value: string): Temporal.PlainDate {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error();
    return Temporal.PlainDate.from(value);
  } catch {
    throw new Error(`Invalid date "${value}"; expected a real date in YYYY-MM-DD format`);
  }
}

function parseApiDate(value: string): Temporal.PlainDate {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) throw new Error(`AlAdhan returned an invalid Gregorian date: "${value}"`);
  try {
    return Temporal.PlainDate.from({
      day: Number(match[1]),
      month: Number(match[2]),
      year: Number(match[3]),
    });
  } catch {
    throw new Error(`AlAdhan returned a non-existent Gregorian date: "${value}"`);
  }
}

function parseClockTime(value: string): { hour: number; minute: number; second: number } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!match) throw new Error(`AlAdhan returned an invalid prayer time: "${value}"`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error(`AlAdhan returned an out-of-range prayer time: "${value}"`);
  }
  return { hour, minute, second };
}

function toPrayerTime(apiDate: string, apiTime: string, timezone: string): PrayerTime {
  const date = parseApiDate(apiDate);
  let zoned: Temporal.ZonedDateTime;
  try {
    zoned = Temporal.ZonedDateTime.from({
      year: date.year,
      month: date.month,
      day: date.day,
      ...parseClockTime(apiTime),
      timeZone: timezone,
    });
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`Could not convert AlAdhan time using timezone "${timezone}"${reason}`);
  }

  const iso = zoned.toInstant().toString();
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return { formatted, iso };
}

function toApiDate(date: Temporal.PlainDate): string {
  return `${String(date.day).padStart(2, "0")}-${String(date.month).padStart(2, "0")}-${date.year}`;
}

function validateOptions(options: FetchAlAdhanPrayerTimesOptions): void {
  if (!options.city.trim() || options.city.length > 100)
    throw new Error("City must be between 1 and 100 characters");
  if (!options.country.trim() || options.country.length > 100)
    throw new Error("Country must be between 1 and 100 characters");
  if (options.state !== undefined && options.state.length > 100)
    throw new Error("State must not exceed 100 characters");
  if (!(options.calculationMethod in ALADHAN_CALCULATION_METHODS))
    throw new Error(`Unsupported AlAdhan calculation method: ${options.calculationMethod}`);
  if (!(options.school in ALADHAN_SCHOOLS))
    throw new Error(`Unsupported AlAdhan school: ${options.school}`);
  if (
    options.latitudeAdjustmentMethod !== undefined &&
    ![1, 2, 3].includes(options.latitudeAdjustmentMethod)
  ) {
    throw new Error("Unsupported high-latitude adjustment method");
  }
  if (options.midnightMode !== undefined && ![0, 1].includes(options.midnightMode)) {
    throw new Error("Unsupported midnight mode");
  }
  if (options.shafaq !== undefined && !["general", "ahmer", "abyad"].includes(options.shafaq)) {
    throw new Error("Unsupported Shafaq setting");
  }
  if (options.tune !== undefined && options.tune.length !== 9) {
    throw new Error("Tune must contain exactly nine prayer adjustments");
  }
  if (options.tune?.some((value) => !Number.isInteger(value) || value < -60 || value > 60)) {
    throw new Error("Each tune adjustment must be an integer from -60 to 60 minutes");
  }
  if (options.calculationMethod === 99) {
    if (options.methodSettings !== undefined && options.methodSettings.length !== 3) {
      throw new Error("Custom method requires exactly three settings");
    }
    if (!options.methodSettings || options.methodSettings.every((value) => value === null)) {
      throw new Error("Custom method requires at least one method setting");
    }
    if (
      options.methodSettings.some(
        (value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 30),
      )
    ) {
      throw new Error("Custom method settings must be null or a number from 0 to 30");
    }
  }
  if (
    options.adjustment !== undefined &&
    (!Number.isInteger(options.adjustment) || options.adjustment < -2 || options.adjustment > 2)
  ) {
    throw new Error("Adjustment must be an integer from -2 to 2");
  }
  if (
    options.timeout !== undefined &&
    (!Number.isFinite(options.timeout) || options.timeout <= 0)
  ) {
    throw new Error("Timeout must be a positive number of milliseconds");
  }
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchDay(
  options: FetchAlAdhanPrayerTimesOptions,
  date: Temporal.PlainDate,
): Promise<AlAdhanDay> {
  const url = new URL(`${BASE_URL}/${toApiDate(date)}`);
  url.searchParams.set("city", options.city.trim());
  url.searchParams.set("country", options.country.trim());
  if (options.state?.trim()) url.searchParams.set("state", options.state.trim());
  url.searchParams.set("method", String(options.calculationMethod));
  url.searchParams.set("school", String(options.school));
  if (options.latitudeAdjustmentMethod !== undefined) {
    url.searchParams.set("latitudeAdjustmentMethod", String(options.latitudeAdjustmentMethod));
  }
  if (options.midnightMode !== undefined)
    url.searchParams.set("midnightMode", String(options.midnightMode));
  if (options.shafaq !== undefined) url.searchParams.set("shafaq", options.shafaq);
  if (options.tune !== undefined) url.searchParams.set("tune", options.tune.join(","));
  if (options.methodSettings !== undefined) {
    url.searchParams.set(
      "methodSettings",
      options.methodSettings.map((value) => (value === null ? "null" : String(value))).join(","),
    );
  }
  if (options.adjustment !== undefined)
    url.searchParams.set("adjustment", String(options.adjustment));

  const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        if (attempt === 0 && isTransientStatus(response.status)) continue;
        throw new Error(
          `AlAdhan request for ${date} failed with HTTP ${response.status} ${response.statusText}`.trim(),
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error(`AlAdhan returned malformed JSON for ${date}`);
      }
      return parseResponse(body);
    } catch (error) {
      const aborted = controller.signal.aborted;
      const networkFailure = error instanceof TypeError;
      if (attempt === 0 && (aborted || networkFailure)) continue;
      if (aborted)
        throw new Error(`AlAdhan request for ${date} timed out after ${timeout}ms (2 attempts)`);
      if (networkFailure)
        throw new Error(
          `AlAdhan network request for ${date} failed after 2 attempts: ${error.message}`,
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`AlAdhan request for ${date} failed after 2 attempts`);
}

/** Fetches Maghrib on `date` and Fajr on the following Gregorian date. */
export async function fetchAlAdhanPrayerTimes(
  options: FetchAlAdhanPrayerTimesOptions,
): Promise<AlAdhanPrayerTimes> {
  validateOptions(options);
  const date = parseServiceDate(options.date);
  const [day, followingDay] = await Promise.all([
    fetchDay(options, date),
    fetchDay(options, date.add({ days: 1 })),
  ]);
  if (followingDay.meta.timezone !== day.meta.timezone) {
    throw new Error("AlAdhan returned inconsistent timezones for Maghrib and following Fajr");
  }

  return {
    maghrib: toPrayerTime(day.date.gregorian.date, day.timings.Maghrib, day.meta.timezone),
    fajr: toPrayerTime(
      followingDay.date.gregorian.date,
      followingDay.timings.Fajr,
      day.meta.timezone,
    ),
    timezone: day.meta.timezone,
    calculationMethod: ALADHAN_CALCULATION_METHODS[options.calculationMethod],
    school: ALADHAN_SCHOOLS[options.school],
    source: "AlAdhan API",
    dailyPrayerTimes: {
      serviceDate: date.toString(),
      fajr:
        parseClockTime(day.timings.Fajr).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Fajr).minute.toString().padStart(2, "0"),
      sunrise:
        parseClockTime(day.timings.Sunrise).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Sunrise).minute.toString().padStart(2, "0"),
      dhuhr:
        parseClockTime(day.timings.Dhuhr).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Dhuhr).minute.toString().padStart(2, "0"),
      asr:
        parseClockTime(day.timings.Asr).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Asr).minute.toString().padStart(2, "0"),
      maghrib:
        parseClockTime(day.timings.Maghrib).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Maghrib).minute.toString().padStart(2, "0"),
      isha:
        parseClockTime(day.timings.Isha).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Isha).minute.toString().padStart(2, "0"),
      midnight:
        parseClockTime(day.timings.Midnight).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(day.timings.Midnight).minute.toString().padStart(2, "0"),
    },
    followingDayPrayerTimes: {
      serviceDate: date.add({ days: 1 }).toString(),
      fajr:
        parseClockTime(followingDay.timings.Fajr).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Fajr).minute.toString().padStart(2, "0"),
      sunrise:
        parseClockTime(followingDay.timings.Sunrise).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Sunrise).minute.toString().padStart(2, "0"),
      dhuhr:
        parseClockTime(followingDay.timings.Dhuhr).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Dhuhr).minute.toString().padStart(2, "0"),
      asr:
        parseClockTime(followingDay.timings.Asr).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Asr).minute.toString().padStart(2, "0"),
      maghrib:
        parseClockTime(followingDay.timings.Maghrib).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Maghrib).minute.toString().padStart(2, "0"),
      isha:
        parseClockTime(followingDay.timings.Isha).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Isha).minute.toString().padStart(2, "0"),
      midnight:
        parseClockTime(followingDay.timings.Midnight).hour.toString().padStart(2, "0") +
        ":" +
        parseClockTime(followingDay.timings.Midnight).minute.toString().padStart(2, "0"),
    },
  };
}
