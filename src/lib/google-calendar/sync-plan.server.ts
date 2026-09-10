import { Temporal } from "@js-temporal/polyfill";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import { IslamicAppPrayerTimeProvider } from "@prophetic-night/prayer-providers";
import {
  ALADHAN_CALCULATION_METHODS,
  fetchAlAdhanPrayerTimes,
  type FetchAlAdhanPrayerTimesOptions,
} from "@/lib/providers/aladhan";
import { getLondonUnifiedPrayerTimes } from "@/lib/providers/london-unified";
import { GoogleCalendarError } from "./errors";
import { buildGooglePlan, GOOGLE_EVENT_TITLES, type GoogleEventId } from "./plan";
import {
  DEFAULT_SYNC_NIGHTS,
  MAX_SYNC_NIGHTS,
  FIXED_SYNC_HORIZONS,
  CONTINUOUS_SYNC_NIGHTS,
  type SyncRequest,
  type SyncSource,
} from "./sync";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GoogleCalendarError("INVALID_REQUEST");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
    throw new GoogleCalendarError("INVALID_REQUEST");
  return value;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new GoogleCalendarError("INVALID_REQUEST");
  return value;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 100)
    throw new GoogleCalendarError("INVALID_REQUEST");
  return value.trim();
}
export function validateSyncRequest(value: unknown): SyncRequest {
  try {
    const body = record(value);
    if (
      body.selectionRevision !== undefined &&
      body.selectionRevision !== null &&
      (typeof body.selectionRevision !== "string" || body.selectionRevision.length > 100)
    )
      throw new Error();
    const startDate = text(body.startDate);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      Temporal.PlainDate.from(startDate).year < 2000 ||
      Temporal.PlainDate.from(startDate).year > 2100
    )
      throw new Error();
    const mode = body.mode ?? "fixed";
    if (mode !== "fixed" && mode !== "continuous") throw new Error();
    const nights = integer(
      body.nights ?? (mode === "continuous" ? CONTINUOUS_SYNC_NIGHTS : DEFAULT_SYNC_NIGHTS),
      1,
      MAX_SYNC_NIGHTS,
    );
    if (mode === "continuous" && nights !== CONTINUOUS_SYNC_NIGHTS) throw new Error();
    if (
      mode === "fixed" &&
      !FIXED_SYNC_HORIZONS.includes(nights) &&
      !(body.mode === undefined && nights <= DEFAULT_SYNC_NIGHTS)
    )
      throw new Error();
    if (
      !Array.isArray(body.selected) ||
      !body.selected.length ||
      body.selected.length > Object.keys(GOOGLE_EVENT_TITLES).length ||
      new Set(body.selected).size !== body.selected.length ||
      body.selected.some((id) => typeof id !== "string" || !Object.hasOwn(GOOGLE_EVENT_TITLES, id))
    )
      throw new Error();
    const options = record(body.options);
    if (typeof options.dawudSelected !== "boolean") throw new Error();
    const parsedOptions = {
      wakeBufferMinutes: integer(options.wakeBufferMinutes, 0, 1440),
      dawudSelected: options.dawudSelected,
      fajrPreparationMinutes: integer(options.fajrPreparationMinutes, 0, 1440),
      firstAdhanMinutes:
        options.firstAdhanMinutes === null ? null : integer(options.firstAdhanMinutes, 0, 1440),
    };
    if (body.selected.includes("first-adhan-reminder") && parsedOptions.firstAdhanMinutes === null)
      throw new Error();
    const raw = record(body.source);
    let source: SyncSource;
    if (raw.kind === "london-unified") source = { kind: raw.kind };
    else if (raw.kind === "coordinates") {
      const timeZone = text(raw.timeZone);
      Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
      source = {
        kind: raw.kind,
        latitude: number(raw.latitude, -90, 90),
        longitude: number(raw.longitude, -180, 180),
        timeZone,
        calculationMethod: integer(raw.calculationMethod, 0, 99),
      };
    } else if (raw.kind === "aladhan") {
      const o = record(raw.options);
      const method = integer(o.calculationMethod, 0, 99);
      if (!Object.hasOwn(ALADHAN_CALCULATION_METHODS, method)) throw new Error();
      const parsed: Omit<FetchAlAdhanPrayerTimesOptions, "date" | "timeout"> = {
        city: text(o.city),
        country: text(o.country),
        calculationMethod: method as FetchAlAdhanPrayerTimesOptions["calculationMethod"],
        school: integer(o.school, 0, 1) as 0 | 1,
      };
      if (o.state !== undefined && o.state !== "") parsed.state = text(o.state);
      if (o.latitudeAdjustmentMethod !== undefined)
        parsed.latitudeAdjustmentMethod = integer(o.latitudeAdjustmentMethod, 1, 3) as 1 | 2 | 3;
      if (o.midnightMode !== undefined)
        parsed.midnightMode = integer(o.midnightMode, 0, 1) as 0 | 1;
      if (o.shafaq !== undefined) {
        if (!["general", "ahmer", "abyad"].includes(String(o.shafaq))) throw new Error();
        parsed.shafaq = o.shafaq as "general" | "ahmer" | "abyad";
      }
      if (o.tune !== undefined) {
        if (!Array.isArray(o.tune) || o.tune.length !== 9) throw new Error();
        parsed.tune = o.tune.map((v) => integer(v, -60, 60)) as unknown as NonNullable<
          typeof parsed.tune
        >;
      }
      if (o.methodSettings !== undefined) {
        if (!Array.isArray(o.methodSettings) || o.methodSettings.length !== 3) throw new Error();
        parsed.methodSettings = o.methodSettings.map((v) =>
          v === null ? null : number(v, 0, 30),
        ) as [number | null, number | null, number | null];
      }
      if (
        method === 99 &&
        (!parsed.methodSettings || parsed.methodSettings.every((v) => v === null))
      )
        throw new Error();
      if (o.adjustment !== undefined) parsed.adjustment = integer(o.adjustment, -2, 2);
      source = { kind: raw.kind, options: parsed };
    } else throw new Error();
    return {
      ...(body.selectionRevision !== undefined
        ? { selectionRevision: body.selectionRevision as string | null }
        : {}),
      startDate,
      nights,
      mode,
      selected: body.selected as GoogleEventId[],
      options: parsedOptions,
      source,
    };
  } catch {
    throw new GoogleCalendarError("INVALID_REQUEST");
  }
}

export function syncDates(startDate: string, nights: number): string[] {
  const start = Temporal.PlainDate.from(startDate);
  return Array.from({ length: nights }, (_, i) => start.add({ days: i }).toString());
}

export async function loadSyncNight(source: SyncSource, date: string) {
  if (source.kind === "coordinates") {
    return new IslamicAppPrayerTimeProvider().getPrayerTimes({ ...source, serviceDate: date });
  }
  const times =
    source.kind === "london-unified"
      ? getLondonUnifiedPrayerTimes(date)
      : await fetchAlAdhanPrayerTimes({ ...source.options, date, timeout: 5000 });
  return {
    maghrib: times.maghrib.iso,
    fajr: times.fajr.iso,
    timeZone: times.timezone,
    source: times.source,
  };
}

export async function calculateSyncNight(input: SyncRequest, date: string, load = loadSyncNight) {
  const times = await load(input.source, date);
  // Reject provider date drift. Never repeat a previous night's clock times.
  const localDate = (instant: string) =>
    Temporal.Instant.from(instant).toZonedDateTimeISO(times.timeZone).toPlainDate().toString();
  if (
    localDate(times.maghrib) !== date ||
    localDate(times.fajr) !== Temporal.PlainDate.from(date).add({ days: 1 }).toString()
  )
    throw new GoogleCalendarError("PRAYER_TIMES_UNAVAILABLE");
  const result = calculateNightSegments(times);
  return buildGooglePlan(result, { ...input.options, prayerSource: times.source }).filter((event) =>
    input.selected.includes(event.id as GoogleEventId),
  );
}
