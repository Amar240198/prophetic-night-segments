"use client";
import { T } from "@/components/i18n/LocaleProvider";
import { useState } from "react";
import type { PrayerPreferences } from "@/lib/product/settings";
import {
  ALADHAN_CALCULATION_METHODS,
  type AlAdhanCalculationMethod,
} from "@/lib/providers/aladhan";
export function PrayerSettings({
  initial,
  onSave,
  buttonLabel = "Save prayer settings",
}: {
  initial: PrayerPreferences;
  onSave: (prayer: PrayerPreferences) => Promise<void>;
  buttonLabel?: string;
}) {
  const [value, setValue] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const source = value.source;
  const options = source.kind === "aladhan" ? source.options : null;
  const method =
    options?.calculationMethod ?? (source.kind === "coordinates" ? source.calculationMethod : 3);
  function updateMethod(method: number) {
    setValue({
      ...value,
      source:
        source.kind === "aladhan"
          ? {
              ...source,
              options: { ...source.options, calculationMethod: method as AlAdhanCalculationMethod },
            }
          : { ...source, calculationMethod: method },
    });
  }
  function locate() {
    setMessage("");
    if (!navigator.geolocation) {
      setMessage("Location is not available in this browser. Enter coordinates manually.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setValue({
          timezone,
          source: {
            kind: "coordinates",
            provider: "aladhan",
            latitude: coords.latitude,
            longitude: coords.longitude,
            timeZone: timezone,
            calculationMethod: method,
            school: 0,
          },
        });
        setBusy(false);
      },
      (error) => {
        setMessage(
          (
            {
              1: "Location permission was denied. Enter coordinates manually or allow access.",
              2: "Your position is unavailable. Try again or enter coordinates manually.",
              3: "Location lookup timed out. Try again.",
            } as Record<number, string>
          )[error.code] ?? "Location could not be acquired.",
        );
        setBusy(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await onSave(value);
          setMessage("Prayer settings saved.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="product-form"
    >
      <p>
        <T>
          {
            "Prayer times supplied by AlAdhan. Choose the calculation method used by your local authority."
          }
        </T>
      </p>
      <label>
        <T>{"Location entry"}</T>
        <select
          value={source.kind}
          onChange={(e) =>
            setValue({
              ...value,
              source:
                e.target.value === "aladhan"
                  ? {
                      kind: "aladhan",
                      options: {
                        city: "London",
                        country: "United Kingdom",
                        calculationMethod: 3,
                        school: 0,
                      },
                    }
                  : {
                      kind: "coordinates",
                      provider: "aladhan",
                      latitude: 51.5074,
                      longitude: -0.1278,
                      timeZone: value.timezone,
                      calculationMethod: 3,
                      school: 0,
                    },
            })
          }
        >
          <option value="aladhan">
            <T>{"City"}</T>
          </option>
          <option value="coordinates">
            <T>{"Precise or manually entered coordinates"}</T>
          </option>
        </select>
      </label>
      {options &&
        (["city", "country"] as const).map((field) => (
          <label key={field}>
            <T>{field === "city" ? "City" : "Country"}</T>
            <input
              required
              maxLength={100}
              value={options[field]}
              onChange={(e) =>
                setValue({
                  ...value,
                  source: { kind: "aladhan", options: { ...options, [field]: e.target.value } },
                })
              }
            />
          </label>
        ))}
      {source.kind === "coordinates" && (
        <>
          {(["latitude", "longitude"] as const).map((field) => (
            <label key={field}>
              <T>{field === "latitude" ? "Latitude" : "Longitude"}</T>
              <input
                required
                type="number"
                step="any"
                min={field === "latitude" ? -90 : -180}
                max={field === "latitude" ? 90 : 180}
                value={source[field]}
                onChange={(e) =>
                  setValue({
                    ...value,
                    source: {
                      ...source,
                      [field]: e.target.value === "" ? NaN : Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
        </>
      )}
      <button type="button" onClick={locate} disabled={busy}>
        <T>{"Use my precise location"}</T>
      </button>
      <label>
        <T>{"Timezone"}</T>
        <input
          required
          value={value.timezone}
          onChange={(e) =>
            setValue({
              ...value,
              timezone: e.target.value,
              source:
                source.kind === "coordinates" ? { ...source, timeZone: e.target.value } : source,
            })
          }
        />
      </label>
      <label>
        <T>{"Calculation method"}</T>
        <select value={method} onChange={(e) => updateMethod(Number(e.target.value))}>
          {Object.entries(ALADHAN_CALCULATION_METHODS)
            .filter(([id]) => id !== "99")
            .map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
      </label>
      <label>
        <T>{"Asr calculation"}</T>
        <select
          value={options?.school ?? (source.kind === "coordinates" ? (source.school ?? 0) : 0)}
          onChange={(e) =>
            setValue({
              ...value,
              source:
                source.kind === "aladhan"
                  ? {
                      ...source,
                      options: { ...source.options, school: Number(e.target.value) as 0 | 1 },
                    }
                  : { ...source, school: Number(e.target.value) as 0 | 1 },
            })
          }
        >
          <option value="0">
            <T>{"Standard"}</T>
          </option>
          <option value="1">
            <T>{"Hanafi"}</T>
          </option>
        </select>
      </label>
      {options && (
        <details>
          <summary>
            <T>{"Advanced adjustments"}</T>
          </summary>
          <label>
            <T>{"High-latitude adjustment"}</T>
            <select
              value={options.latitudeAdjustmentMethod ?? 3}
              onChange={(e) =>
                setValue({
                  ...value,
                  source: {
                    kind: "aladhan",
                    options: {
                      ...options,
                      latitudeAdjustmentMethod: Number(e.target.value) as 1 | 2 | 3,
                    },
                  },
                })
              }
            >
              <option value="1">
                <T>{"Middle of the night"}</T>
              </option>
              <option value="2">
                <T>{"One seventh"}</T>
              </option>
              <option value="3">
                <T>{"Angle based"}</T>
              </option>
            </select>
          </label>
          <label>
            <T>{"Prayer adjustments in minutes (nine comma-separated values)"}</T>
            <input
              value={(options.tune ?? Array(9).fill(0)).join(",")}
              onChange={(e) =>
                setValue({
                  ...value,
                  source: {
                    kind: "aladhan",
                    options: {
                      ...options,
                      tune: e.target.value.split(",").map(Number) as [
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                      ],
                    },
                  },
                })
              }
            />
          </label>
        </details>
      )}
      {message && (
        <p role="status">
          <T>{message}</T>
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        <T>{busy ? "Saving…" : buttonLabel}</T>
      </button>
    </form>
  );
}
