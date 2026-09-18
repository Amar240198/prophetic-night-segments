"use client";
import { Temporal } from "@js-temporal/polyfill";
import { useMemo, useSyncExternalStore } from "react";
import type { FastingProgramme } from "@/lib/fasting/schedule";
const key = "miqat.fasting.v1";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("miqat-fasting", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("miqat-fasting", callback);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function useFastingSettings(date: string) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const settings = useMemo(() => {
    const fallback = {
      selected: ["monday", "thursday"] as FastingProgramme[],
      anchorDate: date,
      anchorFasting: true,
    };
    try {
      const value = JSON.parse(raw ?? "null");
      if (
        !value ||
        !Array.isArray(value.selected) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.anchorDate) ||
        typeof value.anchorFasting !== "boolean"
      )
        return fallback;
      Temporal.PlainDate.from(value.anchorDate);
      return {
        selected: value.selected.filter((p: unknown) =>
          ["monday", "thursday", "white-days", "dawud"].includes(p as string),
        ) as FastingProgramme[],
        anchorDate: value.anchorDate as string,
        anchorFasting: value.anchorFasting as boolean,
      };
    } catch {
      return fallback;
    }
  }, [raw, date]);
  function save(patch: Partial<typeof settings>) {
    localStorage.setItem(key, JSON.stringify({ ...settings, ...patch }));
    window.dispatchEvent(new Event("miqat-fasting"));
  }
  return { ...settings, save };
}
