export const PREFERENCE_STORAGE_KEY = "miqat.preferences.v1";
export const DEFAULT_PREFERENCES = {
  selectedPrayers: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
  defaultSyncHorizon: 30,
  enabledModules: ["today", "all-prayers", "sixth-of-the-night", "calendar"],
  prayerSource: "aladhan",
  location: "gb-london",
} as const;

export interface ProductPreferences {
  selectedPrayers: string[];
  defaultSyncHorizon: 30 | 60 | 90 | "continuous";
  enabledModules: string[];
  prayerSource: string;
  location: string;
}

export function validatePreferences(value: unknown): ProductPreferences {
  if (!value || typeof value !== "object")
    return {
      ...DEFAULT_PREFERENCES,
      selectedPrayers: [...DEFAULT_PREFERENCES.selectedPrayers],
      enabledModules: [...DEFAULT_PREFERENCES.enabledModules],
    };
  const input = value as Partial<ProductPreferences>;
  const selectedPrayers = Array.isArray(input.selectedPrayers)
    ? [
        ...new Set(
          input.selectedPrayers.filter(
            (item): item is string => typeof item === "string" && /^[a-z-]+$/.test(item),
          ),
        ),
      ].slice(0, 5)
    : [...DEFAULT_PREFERENCES.selectedPrayers];
  const horizon = input.defaultSyncHorizon;
  const defaultSyncHorizon =
    horizon === 30 || horizon === 60 || horizon === 90 || horizon === "continuous" ? horizon : 30;
  return {
    selectedPrayers,
    defaultSyncHorizon,
    enabledModules: Array.isArray(input.enabledModules)
      ? [
          ...new Set(
            input.enabledModules.filter(
              (item): item is string => typeof item === "string" && /^[a-z-]+$/.test(item),
            ),
          ),
        ].slice(0, 20)
      : [...DEFAULT_PREFERENCES.enabledModules],
    prayerSource:
      typeof input.prayerSource === "string" &&
      ["aladhan", "coordinates", "manual"].includes(input.prayerSource)
        ? input.prayerSource
        : DEFAULT_PREFERENCES.prayerSource,
    location:
      typeof input.location === "string" && input.location.length <= 100
        ? input.location
        : DEFAULT_PREFERENCES.location,
  };
}

export function loadPreferences(
  storage: Pick<Storage, "getItem"> = localStorage,
): ProductPreferences {
  try {
    return validatePreferences(JSON.parse(storage.getItem(PREFERENCE_STORAGE_KEY) ?? "null"));
  } catch {
    return validatePreferences(null);
  }
}

export function savePreferences(
  value: ProductPreferences,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(validatePreferences(value)));
}
