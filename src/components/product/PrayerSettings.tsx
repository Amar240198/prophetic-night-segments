"use client";
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
        Prayer times supplied by AlAdhan. Choose the calculation method used by your local
        authority.
      </p>
      <label>
        Location entry
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
          <option value="aladhan">City</option>
          <option value="coordinates">Precise or manually entered coordinates</option>
        </select>
      </label>
      {options &&
        (["city", "country"] as const).map((field) => (
          <label key={field}>
            {field === "city" ? "City" : "Country"}
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
              {field === "latitude" ? "Latitude" : "Longitude"}
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
        Use my precise location
      </button>
      <label>
        Timezone
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
        Calculation method
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
        Asr calculation
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
          <option value="0">Standard</option>
          <option value="1">Hanafi</option>
        </select>
      </label>
      {options && (
        <details>
          <summary>Advanced adjustments</summary>
          <label>
            High-latitude adjustment
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
              <option value="1">Middle of the night</option>
              <option value="2">One seventh</option>
              <option value="3">Angle based</option>
            </select>
          </label>
          <label>
            Prayer adjustments in minutes (nine comma-separated values)
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
      {message && <p role="status">{message}</p>}
      <button className="primary-button" disabled={busy}>
        {busy ? "Saving…" : buttonLabel}
      </button>
    </form>
  );
}
