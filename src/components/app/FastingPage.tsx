"use client";
import { Temporal } from "@js-temporal/polyfill";
import { FastingCard } from "@/components/FastingCard";
import { useWorkspace } from "./PrayerWorkspace";
export function FastingPage() {
  const { timeZone } = useWorkspace();
  const date = Temporal.Now.plainDateISO(timeZone).toString();
  return <FastingCard date={date} timeZone={timeZone} />;
}
