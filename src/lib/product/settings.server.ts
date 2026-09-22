import { Temporal } from "@js-temporal/polyfill";
import { database } from "@/lib/google-calendar/database.server";
import { validateSyncRequest } from "@/lib/google-calendar/sync-plan.server";
import {
  DEFAULT_AUTOMATION,
  validateAutomationConfig,
  type AutomationConfig,
} from "@/lib/automation/config";
import { validateAnalysis } from "@/lib/miqat/analysis";
import { DEFAULT_PRAYER, type AccountSettings, type PrayerPreferences } from "./settings";
export function validatePrayer(value: unknown): PrayerPreferences {
  if (!value || typeof value !== "object") throw new Error("INVALID_PREFERENCES");
  const input = value as PrayerPreferences;
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(input.timezone);
  const source = validateSyncRequest({
    source: input.source,
    startDate: "2026-01-01",
    nights: 1,
    selected: ["prayer-fajr"],
    options: {
      wakeBufferMinutes: 0,
      dawudSelected: false,
      fajrPreparationMinutes: 0,
      firstAdhanMinutes: null,
    },
  }).source;
  if (source.kind === "coordinates" && source.timeZone !== input.timezone)
    throw new Error("INVALID_PREFERENCES");
  return { source, timezone: input.timezone };
}
export async function readSettings(userId: string): Promise<AccountSettings> {
  const rows =
    await database()`SELECT p.*, a.configuration FROM miqaat_preferences p LEFT JOIN miqaat_automation a ON a.user_id=p.user_id WHERE p.user_id=${userId}`;
  const row = rows[0];
  const rawPrayer = row?.prayer_configuration as PrayerPreferences | undefined;
  const configured = !!rawPrayer?.source;
  const prayer = configured ? validatePrayer(rawPrayer) : DEFAULT_PRAYER;
  let automation = DEFAULT_AUTOMATION;
  if (row?.configuration) {
    const legacy = row.configuration as AutomationConfig;
    const removed = (legacy.source as { kind: string })?.kind === "london-unified";
    automation = validateAutomationConfig(
      { ...legacy, ...(removed ? { source: prayer.source, timezone: prayer.timezone } : {}) },
      (source) =>
        validatePrayer({ source, timezone: removed ? prayer.timezone : legacy.timezone }).source,
    );
  }
  // Canonical prayer settings override the retained legacy source fields.
  automation = {
    ...automation,
    ...(configured ? { source: prayer.source, timezone: prayer.timezone } : {}),
  };
  return {
    prayer,
    automation,
    analysis: validateAnalysis(row?.prayer_analysis ?? {}),
    onboarding: (row?.onboarding_step as AccountSettings["onboarding"]) ?? "welcome",
    revision: Number(row?.revision ?? 1),
    configured,
    sourceReviewRequired: !configured && row?.prayer_source === "london-unified",
  };
}
