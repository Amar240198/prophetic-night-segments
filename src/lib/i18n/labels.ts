import type { RoutineAnchor, RoutineRecurrence, RoutineType } from "@/lib/routines/model";
/** Explicit display labels: stable API/database enum values are never translation keys. */
export const PRAYER_LABELS = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
} as const;
export const ROUTINE_TYPE_LABELS: Record<RoutineType, string> = {
  qaylula: "Qaylula",
  quran: "Qur’an",
  dhikr: "Dhikr",
  qiyam: "Qiyām",
  tahajjud: "Tahajjud",
  suhoor: "Suḥūr",
  "sleep-preparation": "Sleep preparation",
  custom: "Custom",
};
export const RECURRENCE_LABELS: Record<RoutineRecurrence, string> = {
  daily: "Every day",
  weekdays: "Weekdays",
  "selected-weekdays": "Selected weekdays",
  friday: "Friday",
  monday: "Monday",
  thursday: "Thursday",
  "white-days": "White Days",
  "fasting-days": "Enabled fasting days",
};
export const ANCHOR_LABELS: Record<RoutineAnchor, string> = {
  ...PRAYER_LABELS,
  "last-third": "Last third",
  night_midpoint: "Midpoint",
  last_third_start: "Last third",
  final_sixth_start: "Final sixth",
  bedtime: "Bedtime",
  wake_time: "Wake time",
  jumuah: "Jumu’ah",
};
