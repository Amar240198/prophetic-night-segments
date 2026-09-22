import { Temporal } from "@js-temporal/polyfill";

export type PrayerTimeSource = "coordinates";

export interface PrayerTimeRequest {
  fixtureId?: string;
  serviceDate?: string;
  timeZone?: string;
  maghrib?: string;
  fajr?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  calculationMethod?: number;
  prayerTimeSource?: PrayerTimeSource;
}

export type PrayerProviderErrorCode =
  "INVALID_PROVIDER_INPUT" | "PROVIDER_UNAVAILABLE" | "INVALID_PROVIDER_RESPONSE";

export class PrayerProviderError extends Error {
  constructor(
    public readonly code: PrayerProviderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PrayerProviderError";
  }
}

export interface PrayerTimes {
  maghrib: string;
  fajr: string;
  timeZone: string;
  location: string;
  calculationMethod: string;
  source: string;
  dailyPrayerTimes?: DailyPrayerTimes;
}

export interface DailyPrayerTimes {
  serviceDate: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asrStandard: string;
  asrHanafi: string;
  maghrib: string;
  isha: string;
}

export interface PrayerTimeProvider {
  getPrayerTimes(input: PrayerTimeRequest): Promise<PrayerTimes>;
}

export const demoPrayerTimes: Record<string, PrayerTimes> = {
  "london-summer": {
    maghrib: "2026-07-23T21:02:00+01:00",
    fajr: "2026-07-24T03:15:00+01:00",
    timeZone: "Europe/London",
    location: "London — summer",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
  "london-winter": {
    maghrib: "2026-12-15T15:54:00+00:00",
    fajr: "2026-12-16T05:52:00+00:00",
    timeZone: "Europe/London",
    location: "London — winter",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
  makkah: {
    maghrib: "2026-02-14T18:19:00+03:00",
    fajr: "2026-02-15T05:36:00+03:00",
    timeZone: "Asia/Riyadh",
    location: "Makkah",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
  jakarta: {
    maghrib: "2026-04-12T17:54:00+07:00",
    fajr: "2026-04-13T04:39:00+07:00",
    timeZone: "Asia/Jakarta",
    location: "Jakarta",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
  "oslo-summer": {
    maghrib: "2026-06-10T22:32:00+02:00",
    fajr: "2026-06-11T02:24:00+02:00",
    timeZone: "Europe/Oslo",
    location: "Oslo — summer",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
  sydney: {
    maghrib: "2026-08-20T17:30:00+10:00",
    fajr: "2026-08-21T05:18:00+10:00",
    timeZone: "Australia/Sydney",
    location: "Sydney",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
  kathmandu: {
    maghrib: "2026-03-08T18:11:00+05:45",
    fajr: "2026-03-09T05:12:00+05:45",
    timeZone: "Asia/Kathmandu",
    location: "Kathmandu",
    calculationMethod: "Fixed demonstration fixture",
    source: "Demonstration fixture — not a live prayer timetable",
  },
};

export class DemoPrayerTimeProvider implements PrayerTimeProvider {
  async getPrayerTimes(input: PrayerTimeRequest): Promise<PrayerTimes> {
    const value = demoPrayerTimes[input.fixtureId ?? "london-summer"];
    if (!value) throw new Error("Unknown demonstration fixture");
    return structuredClone(value);
  }
}

export class ManualPrayerTimeProvider implements PrayerTimeProvider {
  async getPrayerTimes(input: PrayerTimeRequest): Promise<PrayerTimes> {
    if (!input.maghrib || !input.fajr || !input.timeZone)
      throw new Error("Manual provider requires maghrib, fajr, and timeZone");
    return {
      maghrib: input.maghrib,
      fajr: input.fajr,
      timeZone: input.timeZone,
      location: input.location ?? "Manual entry",
      calculationMethod: "Supplied by user",
      source: "Manual input",
    };
  }
}

type Fetch = typeof globalThis.fetch;

interface AlAdhanResponse {
  code?: number;
  data?: {
    timings?: { Fajr?: string; Maghrib?: string };
    meta?: { timezone?: string; method?: { name?: string } };
  };
}

interface IslamicAppResponse {
  code?: number;
  data?: {
    timings?: { Fajr?: string; Maghrib?: string };
    meta?: { timezone?: string; method?: number };
  };
}

function requireCoordinate(value: number | undefined, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new PrayerProviderError(
      "INVALID_PROVIDER_INPUT",
      `Coordinate must be a finite number from ${minimum} to ${maximum}.`,
    );
  }
  return value;
}

function parseClock(value: string | undefined): string {
  const match = value?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    throw new PrayerProviderError(
      "INVALID_PROVIDER_RESPONSE",
      "Provider returned an invalid time.",
    );
  }
  return `${match[1]!.padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
}

function toInstant(date: Temporal.PlainDate, clock: string, timeZone: string): string {
  try {
    return Temporal.PlainDateTime.from(`${date.toString()}T${parseClock(clock)}`)
      .toZonedDateTime(timeZone, { disambiguation: "reject" })
      .toInstant()
      .toString();
  } catch (error) {
    if (error instanceof PrayerProviderError) throw error;
    throw new PrayerProviderError(
      "INVALID_PROVIDER_RESPONSE",
      "Provider returned an invalid timezone or local prayer time.",
    );
  }
}

/** AlAdhan adapter. The night engine remains unaware of this or any other provider. */
export class AlAdhanPrayerTimeProvider implements PrayerTimeProvider {
  constructor(
    private readonly fetchImplementation: Fetch = globalThis.fetch,
    private readonly baseUrl = "https://api.aladhan.com/v1",
    private readonly timeoutMilliseconds = 8_000,
  ) {}

  async getPrayerTimes(input: PrayerTimeRequest): Promise<PrayerTimes> {
    const latitude = requireCoordinate(input.latitude, -90, 90);
    const longitude = requireCoordinate(input.longitude, -180, 180);
    let serviceDate: Temporal.PlainDate;
    try {
      serviceDate = Temporal.PlainDate.from(input.serviceDate ?? "");
      if (!input.timeZone) throw new Error("Missing timezone");
      Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(input.timeZone);
    } catch {
      throw new PrayerProviderError(
        "INVALID_PROVIDER_INPUT",
        "serviceDate and a valid IANA timeZone are required.",
      );
    }
    if (
      input.calculationMethod !== undefined &&
      (!Number.isInteger(input.calculationMethod) || input.calculationMethod < 0)
    ) {
      throw new PrayerProviderError(
        "INVALID_PROVIDER_INPUT",
        "calculationMethod must be a non-negative integer.",
      );
    }

    const load = async (date: Temporal.PlainDate): Promise<AlAdhanResponse["data"]> => {
      const pathDate = `${String(date.day).padStart(2, "0")}-${String(date.month).padStart(2, "0")}-${date.year}`;
      const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/timings/${pathDate}`);
      url.searchParams.set("latitude", String(latitude));
      url.searchParams.set("longitude", String(longitude));
      // AlAdhan otherwise infers a timezone from the coordinates. That inference can
      // disagree with the caller near civil-timezone borders and shift the requested
      // local date, so make the API contract's timezone authoritative.
      url.searchParams.set("timezonestring", input.timeZone!);
      if (input.calculationMethod !== undefined) {
        url.searchParams.set("method", String(input.calculationMethod));
      }
      try {
        const response = await this.fetchImplementation(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMilliseconds),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        let body: AlAdhanResponse;
        try {
          body = await response.json();
        } catch {
          throw new PrayerProviderError(
            "INVALID_PROVIDER_RESPONSE",
            "AlAdhan returned an invalid response. Try again later.",
          );
        }
        if (body?.code !== 200 || !body.data?.timings || !body.data.meta?.timezone) {
          throw new PrayerProviderError(
            "INVALID_PROVIDER_RESPONSE",
            "Prayer-time provider returned an incomplete response.",
          );
        }
        return body.data;
      } catch (error) {
        if (error instanceof PrayerProviderError) throw error;
        throw new PrayerProviderError(
          "PROVIDER_UNAVAILABLE",
          "AlAdhan prayer times are temporarily unavailable. Try again or enter trusted timetable times manually.",
        );
      }
    };

    const followingDate = serviceDate.add({ days: 1 });
    const [firstDay, followingDay] = await Promise.all([load(serviceDate), load(followingDate)]);
    const timeZone = firstDay!.meta!.timezone!;
    if (timeZone !== input.timeZone || followingDay!.meta!.timezone !== timeZone) {
      throw new PrayerProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "Prayer-time provider returned an inconsistent timezone.",
      );
    }
    return {
      maghrib: toInstant(serviceDate, firstDay!.timings!.Maghrib!, timeZone),
      fajr: toInstant(followingDate, followingDay!.timings!.Fajr!, timeZone),
      timeZone,
      location: input.location ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      calculationMethod: firstDay!.meta!.method?.name ?? "Provider default",
      source: "AlAdhan prayer-times API",
    };
  }
}

/** Open-source islamic.app adapter. Requires an explicit IANA timezone. */
export class IslamicAppPrayerTimeProvider implements PrayerTimeProvider {
  constructor(
    private readonly fetchImplementation: Fetch = globalThis.fetch,
    private readonly baseUrl = "https://api.islamic.app/v1",
    private readonly timeoutMilliseconds = 8_000,
  ) {}

  async getPrayerTimes(input: PrayerTimeRequest): Promise<PrayerTimes> {
    const latitude = requireCoordinate(input.latitude, -90, 90);
    const longitude = requireCoordinate(input.longitude, -180, 180);
    let serviceDate: Temporal.PlainDate;
    try {
      serviceDate = Temporal.PlainDate.from(input.serviceDate ?? "");
      if (!input.timeZone) throw new Error("Missing timezone");
      Temporal.Now.instant().toZonedDateTimeISO(input.timeZone);
    } catch {
      throw new PrayerProviderError(
        "INVALID_PROVIDER_INPUT",
        "serviceDate and a valid IANA timeZone are required.",
      );
    }
    if (
      input.calculationMethod !== undefined &&
      (!Number.isInteger(input.calculationMethod) || input.calculationMethod < 0)
    ) {
      throw new PrayerProviderError(
        "INVALID_PROVIDER_INPUT",
        "calculationMethod must be a non-negative integer.",
      );
    }

    const load = async (
      date: Temporal.PlainDate,
    ): Promise<NonNullable<IslamicAppResponse["data"]>> => {
      const pathDate = `${String(date.day).padStart(2, "0")}-${String(date.month).padStart(2, "0")}-${date.year}`;
      const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/timings/${pathDate}`);
      url.searchParams.set("latitude", String(latitude));
      url.searchParams.set("longitude", String(longitude));
      url.searchParams.set("timezone", input.timeZone!);
      if (input.calculationMethod !== undefined) {
        url.searchParams.set("method", String(input.calculationMethod));
      }
      try {
        const response = await this.fetchImplementation(url, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(this.timeoutMilliseconds),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as IslamicAppResponse;
        if (body.code !== 200 || !body.data?.timings || !body.data.meta?.timezone) {
          throw new PrayerProviderError(
            "INVALID_PROVIDER_RESPONSE",
            "Prayer-time provider returned an incomplete response.",
          );
        }
        return body.data;
      } catch (error) {
        if (error instanceof PrayerProviderError) throw error;
        throw new PrayerProviderError(
          "PROVIDER_UNAVAILABLE",
          "Prayer-time provider is temporarily unavailable.",
        );
      }
    };

    const followingDate = serviceDate.add({ days: 1 });
    const [firstDay, followingDay] = await Promise.all([load(serviceDate), load(followingDate)]);
    const timeZone = firstDay.meta!.timezone!;
    if (timeZone !== input.timeZone || followingDay.meta!.timezone !== timeZone) {
      throw new PrayerProviderError(
        "INVALID_PROVIDER_RESPONSE",
        "Prayer-time provider returned an inconsistent timezone.",
      );
    }
    const method = firstDay.meta!.method;
    return {
      maghrib: toInstant(serviceDate, firstDay.timings!.Maghrib!, timeZone),
      fajr: toInstant(followingDate, followingDay.timings!.Fajr!, timeZone),
      timeZone,
      location: input.location ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      calculationMethod: method === undefined ? "Provider default" : `islamic.app method ${method}`,
      source: "islamic.app prayer-times API",
    };
  }
}
