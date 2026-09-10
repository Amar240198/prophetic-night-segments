import type { FetchAlAdhanPrayerTimesOptions } from "@/lib/providers/aladhan";
import type { GoogleEventId } from "./plan";
import type { GoogleErrorCode } from "./errors";

export const DEFAULT_SYNC_NIGHTS = 30;
export const FIXED_SYNC_HORIZONS: readonly number[] = [30, 60, 90];
export const CONTINUOUS_SYNC_NIGHTS = 90;
export const MAX_SYNC_NIGHTS = Math.max(...FIXED_SYNC_HORIZONS, CONTINUOUS_SYNC_NIGHTS);
export type SyncMode = "fixed" | "continuous";
export interface SyncPreference {
  mode: SyncMode;
  horizonDays: number;
}
export type SyncSource =
  | { kind: "london-unified" }
  | { kind: "aladhan"; options: Omit<FetchAlAdhanPrayerTimesOptions, "date" | "timeout"> }
  | {
      kind: "coordinates";
      latitude: number;
      longitude: number;
      timeZone: string;
      calculationMethod: number;
    };
export interface SyncContext {
  startDate: string;
  source: SyncSource;
}
export interface SyncOptions {
  wakeBufferMinutes: number;
  dawudSelected: boolean;
  fajrPreparationMinutes: number;
  firstAdhanMinutes: number | null;
}
export interface SyncRequest extends SyncContext {
  /** Omitted mode preserves the original bounded fixed-horizon API. */
  mode?: SyncMode;
  nights: number;
  selected: GoogleEventId[];
  options: SyncOptions;
}
export interface SyncOutcome {
  date: string;
  id: GoogleEventId;
  status: "created" | "updated" | "existing" | "failed";
  code?: GoogleErrorCode;
}
export interface SyncResult {
  nights: number;
  syncedNights: number;
  outcomes: SyncOutcome[];
}
