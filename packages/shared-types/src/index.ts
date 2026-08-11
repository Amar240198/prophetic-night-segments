export type DisplayFormat = "12h" | "24h";
export type DawudActivity = "initial-sleep" | "prayer" | "final-sleep";

export interface NightCalculationInput {
  maghrib: string;
  fajr: string;
  timeZone: string;
  locale?: string;
  displayFormat?: DisplayFormat;
  showSeconds?: boolean;
  fajrWakeBufferMinutes?: number;
  allowLongNight?: boolean;
}

export interface CoordinateNightCalculationInput {
  latitude: number;
  longitude: number;
  serviceDate: string;
  timeZone: string;
  calculationMethod?: number;
  prayerTimeSource?: "coordinates" | "london-unified";
  locale?: string;
  displayFormat?: DisplayFormat;
  showSeconds?: boolean;
  fajrWakeBufferMinutes?: number;
}

export interface CoordinateNightCalculationResult extends NightCalculationResult {
  prayerTimes: {
    provider: string;
    calculationMethod: string;
    timeZone: string;
    dailyPrayerTimes?: {
      serviceDate: string;
      fajr: string;
      sunrise: string;
      dhuhr: string;
      asrStandard: string;
      asrHanafi: string;
      maghrib: string;
      isha: string;
    };
  };
}

export interface NightBoundary {
  index: number;
  label: string;
  instant: string;
  epochMilliseconds: number;
}

export interface NightSegment {
  number: number;
  label: string;
  start: string;
  end: string;
  durationMilliseconds: number;
  durationSeconds: number;
  thirdMembership: 1 | 2 | 3;
  dawudActivity: DawudActivity;
  isWithinLastThird: boolean;
}

export interface NightThird {
  number: 1 | 2 | 3;
  label: string;
  start: string;
  end: string;
  durationMilliseconds: number;
  includedSegments: number[];
}

export interface TimeWindow {
  start: string;
  end: string;
  segments: number[];
}

export interface DawudPattern {
  initialSleep: TimeWindow;
  prayer: TimeWindow;
  finalSleep: TimeWindow;
  fajrWake: { suggestedAlarm: string; fajr: string; bufferMinutes: number };
  sourceReference: "Ṣaḥīḥ al-Bukhārī 1131";
  disclaimer: string;
}

export interface WorshipWindow extends TimeWindow {
  label: string;
}

export interface AlarmItem {
  id: string;
  label: string;
  instant: string;
}

export interface AlarmPlan {
  alarms: AlarmItem[];
  disclaimer: string;
}

export interface CalculationMetadata {
  calculationVersion: "1.0";
  generatedAt: string;
  religiousClassification: "informational-scheduling-tool";
  precisionPolicy: string;
}

export interface NightCalculationResult {
  input: Pick<NightCalculationInput, "maghrib" | "fajr" | "timeZone">;
  night: {
    start: string;
    end: string;
    durationMilliseconds: number;
    durationSeconds: number;
    durationFormatted: string;
  };
  boundaries: NightBoundary[];
  segments: NightSegment[];
  thirds: NightThird[];
  midpoint: string;
  lastThird: WorshipWindow;
  dawudPattern: DawudPattern;
  metadata: CalculationMetadata;
}

export type ValidationErrorCode =
  | "REQUIRED_FIELD"
  | "INVALID_TIMESTAMP"
  | "INVALID_TIMEZONE"
  | "INVALID_NIGHT_INTERVAL"
  | "NIGHT_TOO_LONG"
  | "INVALID_WAKE_BUFFER"
  | "WAKE_BUFFER_EXCEEDS_NIGHT";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  field?: string;
  details: Record<string, unknown>;
}

export interface FormatOptions {
  locale?: string;
  timeZone?: string;
  displayFormat?: DisplayFormat;
  showSeconds?: boolean;
}

export interface AlarmPreferences {
  atPart4?: boolean;
  atPart5?: boolean;
  atLastThird?: boolean;
  minutesBeforeFajr?: number;
  endPrayerAtPart6?: boolean;
  fajrPreparationMinutes?: number;
}
