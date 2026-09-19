import type { Routine, RoutineAnchor, RoutineType } from "./model";
export interface RoutineTemplate {
  key: string;
  title: string;
  type: RoutineType;
  anchor: RoutineAnchor;
  offsetMinutes: number;
  durationMinutes: number;
  recurrence: Routine["recurrence"];
  description: string;
  category: "daily" | "night";
}
/** Suggestions are optional scheduling choices, not claims about prescribed exact timings. */
export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  {
    key: "morning-adhkar",
    title: "Morning Adhkar",
    type: "dhikr",
    anchor: "fajr",
    offsetMinutes: 0,
    durationMinutes: 15,
    recurrence: "daily",
    description: "Begin after Fajr.",
    category: "daily",
  },
  {
    key: "evening-adhkar",
    title: "Evening Adhkar",
    type: "dhikr",
    anchor: "asr",
    offsetMinutes: 15,
    durationMinutes: 15,
    recurrence: "daily",
    description: "Move with Asr as prayer times change.",
    category: "daily",
  },
  {
    key: "quran-reading",
    title: "Qur’an reading",
    type: "quran",
    anchor: "maghrib",
    offsetMinutes: -30,
    durationMinutes: 20,
    recurrence: "daily",
    description: "Make space before Maghrib.",
    category: "daily",
  },
  {
    key: "surah-al-mulk",
    title: "Surah Al-Mulk",
    type: "quran",
    anchor: "bedtime",
    offsetMinutes: -20,
    durationMinutes: 10,
    recurrence: "daily",
    description: "Requires your personal bedtime anchor.",
    category: "night",
  },
  {
    key: "qiyam",
    title: "Qiyām",
    type: "qiyam",
    anchor: "last_third_start",
    offsetMinutes: 0,
    durationMinutes: 20,
    recurrence: "daily",
    description: "An optional prayer block beginning at the last third.",
    category: "night",
  },
  {
    key: "last-third-prayer",
    title: "Last-third prayer",
    type: "qiyam",
    anchor: "last_third_start",
    offsetMinutes: 0,
    durationMinutes: 15,
    recurrence: "daily",
    description: "Uses the supplied Maghrib-to-Fajr night.",
    category: "night",
  },
  {
    key: "witr",
    title: "Witr",
    type: "custom",
    anchor: "fajr",
    offsetMinutes: -20,
    durationMinutes: 10,
    recurrence: "daily",
    description: "An optional reminder before Fajr.",
    category: "night",
  },
  {
    key: "suhoor",
    title: "Suhoor reminder",
    type: "suhoor",
    anchor: "fajr",
    offsetMinutes: -45,
    durationMinutes: 20,
    recurrence: "daily",
    description: "Daily reminder; enable only for the dates you intend to fast.",
    category: "night",
  },
  {
    key: "iftar",
    title: "Iftar reminder",
    type: "custom",
    anchor: "maghrib",
    offsetMinutes: 0,
    durationMinutes: 15,
    recurrence: "daily",
    description: "Daily reminder at Maghrib; enable for your fasting schedule.",
    category: "daily",
  },
];
