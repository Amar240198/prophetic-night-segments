import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  validatePreferences,
} from "./preferences";
import { hasEntitlement, normalizeEntitlement } from "./entitlements";

describe("product foundations", () => {
  it("normalizes free defaults and validates persisted preferences", () => {
    expect(
      validatePreferences({ defaultSyncHorizon: 999, selectedPrayers: ["fajr", "fajr", 3] }),
    ).toMatchObject({
      ...DEFAULT_PREFERENCES,
      selectedPrayers: ["fajr"],
      defaultSyncHorizon: 30,
    });
  });
  it("persists preferences without depending on an account provider", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const input = validatePreferences({
      selectedPrayers: ["fajr", "isha"],
      defaultSyncHorizon: "continuous",
    });
    savePreferences(input, storage);
    expect(loadPreferences(storage)).toEqual(input);
  });
  it("recognizes server-provided plan entitlements", () => {
    expect(normalizeEntitlement({ plan: "PRO" })).toEqual({ plan: "PRO", active: true });
    expect(hasEntitlement(normalizeEntitlement({ plan: "PRO" }), "PRO")).toBe(true);
    expect(hasEntitlement(normalizeEntitlement({ plan: "FREE" }), "PRO")).toBe(false);
  });
});

import { featureEntitlements } from "./entitlements";
it("keeps free calculations independent of payment and exposes trial/rollout capabilities", () => {
  expect(featureEntitlements({ plan: "FREE", active: true })["night-segments"]).toBe(true);
  expect(featureEntitlements({ plan: "FREE", active: true })["protected-blocks"]).toBe(false);
  expect(
    featureEntitlements({ plan: "FREE", active: true }, { readOnlyRollout: true })["calendar-read"],
  ).toBe(true);
  expect(
    featureEntitlements({ plan: "FREE", active: true }, { trialActive: true })["protected-blocks"],
  ).toBe(true);
});

it("replaces removed or unknown UI sources with the live default", () => {
  expect(validatePreferences({ prayerSource: "london-unified" }).prayerSource).toBe("aladhan");
  expect(validatePreferences({ prayerSource: "unknown" }).prayerSource).toBe("aladhan");
  expect(validatePreferences({ prayerSource: "manual" }).prayerSource).toBe("manual");
});
