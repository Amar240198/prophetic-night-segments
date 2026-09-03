"use client";

import { createAlarmPlan, formatInstant } from "@prophetic-night/night-engine";
import type {
  AlarmPreferences,
  NightCalculationInput,
  NightCalculationResult,
} from "@prophetic-night/night-engine";
import { useMemo, useState } from "react";

interface ScheduleToolsProps {
  result: NightCalculationResult;
  input: NightCalculationInput;
  firstAdhanMinutes: number | null;
}

interface NightEndEvent {
  id: "buffer-wake-up" | "first-adhan-reminder" | "buffer-before-fajr" | "fajr";
  label: string;
  instant: string;
}

export const DEFAULT_BUFFER_BEFORE_FAJR_MINUTES = 20;

export function createNightEndSchedule(
  result: NightCalculationResult,
  fajrPreparationMinutes: number,
  firstAdhanMinutes: number | null,
): NightEndEvent[] {
  const fajr = Date.parse(result.night.end);
  const events: NightEndEvent[] = [
    {
      id: "buffer-wake-up",
      label: "Buffer Wake-Up Time",
      instant: result.dawudPattern.fajrWake.suggestedAlarm,
    },
    {
      id: "buffer-before-fajr",
      label: "Buffer Before Fajr",
      instant: new Date(fajr - fajrPreparationMinutes * 60_000).toISOString(),
    },
    { id: "fajr", label: "Fajr", instant: result.night.end },
  ];
  if (firstAdhanMinutes !== null) {
    events.push({
      id: "first-adhan-reminder",
      label: "First Adhan Reminder",
      instant: new Date(fajr - firstAdhanMinutes * 60_000).toISOString(),
    });
  }
  return events.sort((left, right) => Date.parse(left.instant) - Date.parse(right.instant));
}

interface NightEndTimelineProps {
  result: NightCalculationResult;
  timeZone: string;
  firstAdhanMinutes: number | null;
  bufferBeforeFajrMinutes?: number;
}

export function NightEndTimeline({
  result,
  timeZone,
  firstAdhanMinutes,
  bufferBeforeFajrMinutes = DEFAULT_BUFFER_BEFORE_FAJR_MINUTES,
}: NightEndTimelineProps) {
  const schedule = useMemo(
    () => createNightEndSchedule(result, bufferBeforeFajrMinutes, firstAdhanMinutes),
    [result, bufferBeforeFajrMinutes, firstAdhanMinutes],
  );

  return (
    <section
      className="mt-7 border border-white/10 bg-[#0c2229] p-5 sm:p-7"
      aria-labelledby="night-end-title"
    >
      <p className="text-xs font-bold tracking-[0.16em] text-[#d0ae67]">END OF NIGHT</p>
      <h3 id="night-end-title" className="mt-2 font-serif text-2xl">
        End of the calculated night
      </h3>
      <p className="mt-2 text-sm leading-6 text-[#9baca7]">
        Events are shown in chronological order. Fajr remains the final boundary of the Islamic
        night.
      </p>
      <ol className="mt-5 grid gap-2" aria-live="polite">
        {schedule.map((event, index) => {
          const coincidesWithPrevious = index > 0 && schedule[index - 1]!.instant === event.instant;
          return (
            <li
              key={event.id}
              className={`grid grid-cols-[1.25rem_1fr_auto] items-center gap-3 border p-3 ${
                event.id === "fajr"
                  ? "border-[#d0ae67] bg-[#d0ae67]/10"
                  : "border-white/10 bg-[#06151a]"
              }`}
            >
              <span aria-hidden="true" className="text-center text-[#d0ae67]">
                {index === schedule.length - 1 ? "●" : "↓"}
              </span>
              <span>
                {event.label}
                {coincidesWithPrevious && (
                  <span className="ml-2 text-xs text-[#8ea29d]">Same time as above</span>
                )}
              </span>
              <strong className="text-[#d0ae67]">
                {formatInstant(event.instant, { timeZone, displayFormat: "24h" })}
              </strong>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs leading-5 text-[#8ea29d]">
        Fajr is the beginning of Fajr / true dawn (al-Fajr al-Ṣādiq). The First Adhan Reminder is a
        selected scheduling offset, not an astronomical dawn calculation.
      </p>
    </section>
  );
}

function calendarInstant(value: string): string {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function calendarText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function createCalendarContents(
  result: NightCalculationResult,
  preferences: AlarmPreferences,
  firstAdhanMinutes: number | null,
): string {
  const alarms = createAlarmPlan(result, preferences).alarms;
  if (firstAdhanMinutes !== null) {
    alarms.push({
      id: "first-adhan-reminder",
      label: "First Adhan Reminder",
      instant: new Date(Date.parse(result.night.end) - firstAdhanMinutes * 60_000).toISOString(),
    });
  }
  const events = alarms
    .map((alarm) => {
      const end = new Date(Date.parse(alarm.instant) + 5 * 60_000).toISOString();
      return [
        "BEGIN:VEVENT",
        `UID:${alarm.id}-${Date.parse(alarm.instant)}@prophetic-night-segments`,
        `DTSTAMP:${calendarInstant(result.night.start)}`,
        `DTSTART:${calendarInstant(alarm.instant)}`,
        `DTEND:${calendarInstant(end)}`,
        `SUMMARY:${calendarText(alarm.label)}`,
        `DESCRIPTION:${calendarText("Informational scheduling reminder generated by Prophetic Night Segments.")}`,
        "END:VEVENT",
      ].join("\r\n");
    })
    .join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Prophetic Night Segments//EN",
    events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadCalendar(
  result: NightCalculationResult,
  preferences: AlarmPreferences,
  firstAdhanMinutes: number | null,
) {
  const contents = createCalendarContents(result, preferences, firstAdhanMinutes);
  const url = URL.createObjectURL(new Blob([contents], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "prophetic-night-segments-alarms.ics";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ScheduleTools({ result, input, firstAdhanMinutes }: ScheduleToolsProps) {
  const [preferences, setPreferences] = useState<AlarmPreferences>({
    atPart4: true,
    atLastThird: true,
    endPrayerAtPart6: true,
    fajrPreparationMinutes: DEFAULT_BUFFER_BEFORE_FAJR_MINUTES,
  });
  const plan = useMemo(() => createAlarmPlan(result, preferences), [result, preferences]);

  function updateCustomMinutes(value: string) {
    const next = { ...preferences };
    if (value === "") delete next.minutesBeforeFajr;
    else next.minutesBeforeFajr = Number(value);
    setPreferences(next);
  }

  return (
    <section
      className="border border-white/10 bg-[#0c2229] p-5 sm:p-9"
      aria-labelledby="alarms-title"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">03 / PLAN</p>
      <h2 id="alarms-title" className="mt-3 font-serif text-3xl">
        Alarm planning
      </h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(
          [
            ["atPart4", "Wake at beginning of Part 4"],
            ["atPart5", "Wake at beginning of Part 5"],
            ["atLastThird", "Wake at beginning of last third"],
            ["endPrayerAtPart6", "End prayer at beginning of Part 6"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-3 border border-white/10 p-3">
            <input
              type="checkbox"
              checked={Boolean(preferences[key])}
              onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
        <label className="grid gap-2 text-sm text-[#c8d4d0]">
          Custom minutes before Fajr
          <input
            type="number"
            min="0"
            value={preferences.minutesBeforeFajr ?? ""}
            onChange={(event) => updateCustomMinutes(event.target.value)}
            className="border border-white/20 bg-[#06151a] px-3 py-2 text-white"
          />
        </label>
      </div>
      <div className="mt-6 divide-y divide-white/10 border-y border-white/10" aria-live="polite">
        {plan.alarms.map((alarm) => (
          <p key={alarm.id} className="flex flex-wrap justify-between gap-3 py-3">
            <span>{alarm.label}</span>
            <strong className="text-[#d0ae67]">
              {formatInstant(alarm.instant, {
                timeZone: input.timeZone,
                displayFormat: "24h",
              })}
            </strong>
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={() => downloadCalendar(result, preferences, firstAdhanMinutes)}
        className="mt-6 border border-[#d0ae67] px-5 py-3 font-semibold text-[#d0ae67] hover:bg-[#d0ae67]/10"
      >
        Download calendar (.ics)
      </button>
      <p className="mt-3 text-xs leading-5 text-[#8ea29d]">
        Calendar reminders depend on your device and calendar app. A browser cannot reliably sound
        an alarm after it closes.
      </p>
    </section>
  );
}
