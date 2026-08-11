import { Temporal } from "@js-temporal/polyfill";
import type {
  AlarmPlan,
  AlarmPreferences,
  DawudActivity,
  DawudPattern,
  FormatOptions,
  NightCalculationInput,
  NightCalculationResult,
  NightSegment,
  NightThird,
  ValidationError,
} from "@prophetic-night/shared-types";

export * from "@prophetic-night/shared-types";

const MAX_STANDARD_NIGHT_MS = 18 * 60 * 60 * 1000;
const DISCLAIMER =
  "A scheduling visualisation based on the night pattern attributed to Prophet Dāwūd in Ṣaḥīḥ al-Bukhārī 1131; it is not a compulsory practice or religious ruling.";

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function epoch(value: string): number | undefined {
  try {
    const milliseconds = Temporal.Instant.from(value).epochMilliseconds;
    return Number(milliseconds);
  } catch {
    return undefined;
  }
}

export function validateNightInput(input: Partial<NightCalculationInput>): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const field of ["maghrib", "fajr", "timeZone"] as const) {
    if (!input[field]) {
      errors.push({
        code: "REQUIRED_FIELD",
        message: `${field} is required.`,
        field,
        details: {},
      });
    }
  }
  const start = input.maghrib ? epoch(input.maghrib) : undefined;
  const end = input.fajr ? epoch(input.fajr) : undefined;
  if (input.maghrib && start === undefined)
    errors.push({
      code: "INVALID_TIMESTAMP",
      message: "Maghrib must be an ISO 8601 timestamp with an explicit UTC offset.",
      field: "maghrib",
      details: {},
    });
  if (input.fajr && end === undefined)
    errors.push({
      code: "INVALID_TIMESTAMP",
      message: "Fajr must be an ISO 8601 timestamp with an explicit UTC offset.",
      field: "fajr",
      details: {},
    });
  if (input.timeZone && !validTimeZone(input.timeZone))
    errors.push({
      code: "INVALID_TIMEZONE",
      message: "timeZone must be a valid IANA timezone.",
      field: "timeZone",
      details: {},
    });
  if (start !== undefined && end !== undefined && end <= start)
    errors.push({
      code: "INVALID_NIGHT_INTERVAL",
      message: "Fajr must occur after Maghrib as an absolute instant.",
      field: "fajr",
      details: {},
    });
  if (
    start !== undefined &&
    end !== undefined &&
    end - start > MAX_STANDARD_NIGHT_MS &&
    !input.allowLongNight
  )
    errors.push({
      code: "NIGHT_TOO_LONG",
      message: "Night exceeds 18 hours; set allowLongNight to confirm this interval.",
      field: "fajr",
      details: { maximumMilliseconds: MAX_STANDARD_NIGHT_MS },
    });
  const buffer = input.fajrWakeBufferMinutes ?? 0;
  if (!Number.isFinite(buffer) || buffer < 0)
    errors.push({
      code: "INVALID_WAKE_BUFFER",
      message: "Wake buffer must be a non-negative number.",
      field: "fajrWakeBufferMinutes",
      details: {},
    });
  if (start !== undefined && end !== undefined && buffer * 60_000 > end - start)
    errors.push({
      code: "WAKE_BUFFER_EXCEEDS_NIGHT",
      message: "Wake buffer cannot exceed the night interval.",
      field: "fajrWakeBufferMinutes",
      details: {},
    });
  return errors;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function durationText(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function calculateNightSegments(input: NightCalculationInput): NightCalculationResult {
  const errors = validateNightInput(input);
  if (errors.length)
    throw Object.assign(new Error(errors[0]!.message), { validationErrors: errors });
  const start = epoch(input.maghrib)!;
  const end = epoch(input.fajr)!;
  const total = end - start;
  // Each boundary is independently derived. floor assigns indivisible milliseconds
  // deterministically while B6 is forced to the exact supplied Fajr instant.
  const points = Array.from({ length: 7 }, (_, i) =>
    i === 6 ? end : start + Math.floor((total * i) / 6),
  );
  const boundaries = points.map((instant, index) => ({
    index,
    label: index === 0 ? "Maghrib" : index === 6 ? "Fajr" : `Boundary ${index}`,
    instant: iso(instant),
    epochMilliseconds: instant,
  }));
  const activities: DawudActivity[] = [
    "initial-sleep",
    "initial-sleep",
    "initial-sleep",
    "prayer",
    "prayer",
    "final-sleep",
  ];
  const segments: NightSegment[] = Array.from({ length: 6 }, (_, index) => {
    const segmentStart = points[index]!;
    const segmentEnd = points[index + 1]!;
    const number = index + 1;
    const thirdMembership = (Math.floor(index / 2) + 1) as 1 | 2 | 3;
    return {
      number,
      label: `Part ${number}`,
      start: iso(segmentStart),
      end: iso(segmentEnd),
      durationMilliseconds: segmentEnd - segmentStart,
      durationSeconds: (segmentEnd - segmentStart) / 1000,
      thirdMembership,
      dawudActivity: activities[index]!,
      isWithinLastThird: number >= 5,
    };
  });
  const thirdLabels = ["First third", "Second third", "Last third"];
  const thirds: NightThird[] = ([0, 1, 2] as const).map((index) => ({
    number: (index + 1) as 1 | 2 | 3,
    label: thirdLabels[index]!,
    start: iso(points[index * 2]!),
    end: iso(points[index * 2 + 2]!),
    durationMilliseconds: points[index * 2 + 2]! - points[index * 2]!,
    includedSegments: [index * 2 + 1, index * 2 + 2],
  }));
  const buffer = input.fajrWakeBufferMinutes ?? 0;
  const dawudPattern: DawudPattern = {
    initialSleep: { start: iso(points[0]!), end: iso(points[3]!), segments: [1, 2, 3] },
    prayer: { start: iso(points[3]!), end: iso(points[5]!), segments: [4, 5] },
    finalSleep: { start: iso(points[5]!), end: iso(points[6]!), segments: [6] },
    fajrWake: {
      suggestedAlarm: iso(end - buffer * 60_000),
      fajr: iso(end),
      bufferMinutes: buffer,
    },
    sourceReference: "Ṣaḥīḥ al-Bukhārī 1131",
    disclaimer: DISCLAIMER,
  };
  return {
    input: { maghrib: input.maghrib, fajr: input.fajr, timeZone: input.timeZone },
    night: {
      start: iso(start),
      end: iso(end),
      durationMilliseconds: total,
      durationSeconds: total / 1000,
      durationFormatted: durationText(total),
    },
    boundaries,
    segments,
    thirds,
    midpoint: iso(points[3]!),
    lastThird: {
      label: "Last Third of the Night",
      start: iso(points[4]!),
      end: iso(points[6]!),
      segments: [5, 6],
    },
    dawudPattern,
    metadata: {
      calculationVersion: "1.0",
      generatedAt: iso(end),
      religiousClassification: "informational-scheduling-tool",
      precisionPolicy: "floor(totalMilliseconds × boundaryIndex ÷ 6), with B6 equal to Fajr",
    },
  };
}

export function calculateLastThird(input: NightCalculationInput) {
  return calculateNightSegments(input).lastThird;
}

export function calculateDawudPattern(input: NightCalculationInput) {
  return calculateNightSegments(input).dawudPattern;
}

export function formatInstant(value: string, options: FormatOptions = {}): string {
  return new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    timeZone: options.timeZone ?? "UTC",
    hour: "numeric",
    minute: "2-digit",
    ...(options.showSeconds ? { second: "2-digit" } : {}),
    hour12: options.displayFormat === "12h",
  }).format(new Date(value));
}

export function formatNightResult(result: NightCalculationResult, options: FormatOptions = {}) {
  const timeZone = options.timeZone ?? result.input.timeZone;
  return {
    ...result,
    segments: result.segments.map((segment) => ({
      ...segment,
      startFormatted: formatInstant(segment.start, { ...options, timeZone }),
      endFormatted: formatInstant(segment.end, { ...options, timeZone }),
    })),
  };
}

export function createAlarmPlan(
  result: NightCalculationResult,
  preferences: AlarmPreferences,
): AlarmPlan {
  const alarms = [];
  if (preferences.atPart4)
    alarms.push({
      id: "part-4",
      label: "Beginning of Part 4",
      instant: result.boundaries[3]!.instant,
    });
  if (preferences.atPart5)
    alarms.push({
      id: "part-5",
      label: "Beginning of Part 5",
      instant: result.boundaries[4]!.instant,
    });
  if (preferences.atLastThird)
    alarms.push({
      id: "last-third",
      label: "Beginning of the last third",
      instant: result.lastThird.start,
    });
  if (preferences.endPrayerAtPart6)
    alarms.push({
      id: "part-6",
      label: "Beginning of Part 6",
      instant: result.boundaries[5]!.instant,
    });
  const beforeFajr = preferences.minutesBeforeFajr;
  if (beforeFajr !== undefined && beforeFajr >= 0)
    alarms.push({
      id: "custom-before-fajr",
      label: `${beforeFajr} minutes before Fajr`,
      instant: iso(Date.parse(result.night.end) - beforeFajr * 60_000),
    });
  const preparation = preferences.fajrPreparationMinutes;
  if (preparation !== undefined && preparation >= 0)
    alarms.push({
      id: "fajr-preparation",
      label: "Prepare for Fajr",
      instant: iso(Date.parse(result.night.end) - preparation * 60_000),
    });
  return {
    alarms,
    disclaimer:
      "Calendar reminders depend on the device and calendar app. A browser cannot guarantee an alarm after it closes.",
  };
}
