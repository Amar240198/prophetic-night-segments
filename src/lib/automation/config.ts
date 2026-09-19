import { Temporal } from "@js-temporal/polyfill";
import type { SyncSource } from "@/lib/google-calendar/sync";
import type { FastingProgramme } from "@/lib/fasting/schedule";
export interface AutomationConfig {
  source: SyncSource;
  timezone: string;
  horizon: 30 | 60 | 90 | "continuous";
  calendarId: "primary";
  modules: Array<"prayers" | "routines" | "night" | "fasting">;
  selectedPrayers: Array<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha">;
  personalAnchors: { bedtime?: string; wake_time?: string; jumuah?: string };
  fasting: FastingProgramme[];
  night: "boundaries" | "dawud";
  onboardingComplete: boolean;
  removeObsolete: boolean;
}
export const DEFAULT_AUTOMATION: AutomationConfig = {
  source: { kind: "london-unified" },
  timezone: "Europe/London",
  horizon: 30,
  calendarId: "primary",
  modules: ["prayers", "routines"],
  selectedPrayers: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
  personalAnchors: {},
  fasting: [],
  night: "boundaries",
  onboardingComplete: false,
  removeObsolete: false,
};
export function validateAutomationConfig(
  value: unknown,
  validateSource: (source: unknown) => SyncSource,
): AutomationConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_AUTOMATION");
  const input = value as AutomationConfig;
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(input.timezone);
  if (
    ![30, 60, 90, "continuous"].includes(input.horizon) ||
    input.calendarId !== "primary" ||
    !["boundaries", "dawud"].includes(input.night) ||
    typeof input.onboardingComplete !== "boolean"
  )
    throw new Error("INVALID_AUTOMATION");
  const list = <T extends string>(items: unknown, choices: readonly T[]): T[] => {
    if (
      !Array.isArray(items) ||
      items.length > choices.length ||
      new Set(items).size !== items.length ||
      items.some((item) => !choices.includes(item))
    )
      throw new Error("INVALID_AUTOMATION");
    return items;
  };
  const personalAnchors: AutomationConfig["personalAnchors"] = {};
  if (!input.personalAnchors || typeof input.personalAnchors !== "object")
    throw new Error("INVALID_AUTOMATION");
  for (const key of ["bedtime", "wake_time", "jumuah"] as const) {
    const clock = input.personalAnchors[key];
    if (clock !== undefined && clock !== "") {
      if (typeof clock !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(clock))
        throw new Error("INVALID_AUTOMATION");
      personalAnchors[key] = clock;
    }
  }
  return {
    source: validateSource(input.source),
    timezone: input.timezone,
    horizon: input.horizon,
    calendarId: "primary",
    modules: list(input.modules, ["prayers", "routines", "night", "fasting"]),
    selectedPrayers: list(input.selectedPrayers, ["fajr", "dhuhr", "asr", "maghrib", "isha"]),
    personalAnchors,
    fasting: list(input.fasting, ["monday", "thursday", "white-days"]),
    night: input.night,
    onboardingComplete: input.onboardingComplete,
    removeObsolete: input.removeObsolete === true,
  };
}
