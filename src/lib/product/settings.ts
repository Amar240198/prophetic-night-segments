import type { SyncSource } from "@/lib/google-calendar/sync";
import type { AutomationConfig } from "@/lib/automation/config";
import type { AnalysisPreferences } from "@/lib/miqat/model";
export const ONBOARDING_STEPS = [
  "welcome",
  "prayer",
  "plan",
  "calendar",
  "selection",
  "automation",
  "complete",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export interface PrayerPreferences {
  source: SyncSource;
  timezone: string;
}
export interface AccountSettings {
  prayer: PrayerPreferences;
  automation: AutomationConfig;
  analysis: AnalysisPreferences;
  onboarding: OnboardingStep;
  revision: number;
  configured: boolean;
  sourceReviewRequired?: boolean;
}
export const DEFAULT_PRAYER: PrayerPreferences = {
  source: {
    kind: "aladhan",
    options: { city: "London", country: "United Kingdom", calculationMethod: 3, school: 0 },
  },
  timezone: "Europe/London",
};
export function nextOnboardingStep(step: OnboardingStep, pro: boolean): OnboardingStep {
  if (step === "plan" && !pro) return "complete";
  return ONBOARDING_STEPS[
    Math.min(ONBOARDING_STEPS.indexOf(step) + 1, ONBOARDING_STEPS.length - 1)
  ]!;
}
