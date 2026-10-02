"use client";
import { T } from "@/components/i18n/LocaleProvider";

import type { SyncContext } from "@/lib/google-calendar/sync";
import Link from "next/link";
import { generateICS } from "@/lib/calendar/generateICS";
import { assignExportIdentities } from "@/lib/calendar/exportIdentity";
import { useState } from "react";
import type { NightCalculationResult } from "@prophetic-night/night-engine";
import { buildCalendarEvents, formatCalendarTime } from "@/lib/calendar/buildCalendarEvents";

export function CalendarCard({
  result,
  dawudSelected,
  prayerSource,
  firstAdhanMinutes = null,
  wakeBufferMinutes = 0,
}: {
  result: NightCalculationResult;
  dawudSelected: boolean;
  prayerSource: string;
  firstAdhanMinutes?: number | null;
  wakeBufferMinutes?: number;
  syncContext?: SyncContext | null;
}) {
  const [selected, setSelected] = useState(["wake", "buffer-before-fajr", "last-third", "fajr"]);
  const [exportError, setExportError] = useState("");
  const minutes = firstAdhanMinutes ?? wakeBufferMinutes;
  const valid = Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440;
  const events = buildCalendarEvents(result, {
    wakeBufferMinutes: valid ? minutes : 0,
    pattern: dawudSelected ? "dawud" : "last-third",
    prayerSource,
  });
  return (
    <section
      className="border border-white/10 bg-[#0c2229] p-5 sm:p-9"
      aria-labelledby="calendar-title"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">
        <T>{"CALENDAR"}</T>
      </p>
      <h2 id="calendar-title" className="mt-3 font-serif text-3xl">
        <T>{"Add to Calendar"}</T>
      </h2>
      <p className="mt-3 text-[#c8d4d0]">
        <T>{"Plan tonight around Qiyam / Tahajjud."}</T>
      </p>
      <p className="mt-2 text-sm text-[#9baca7]">
        <T>{"Suggested prayer window:"}</T>{" "}
        <T>{dawudSelected ? "Dāwūd pattern (Parts 4–5)" : "last third (Parts 5–6)"}</T>
        <T>{". Times shown in"}</T> {result.input.timeZone}.
      </p>
      {!valid && (
        <p id="calendar-buffer-error" role="alert" className="mt-3 text-red-300">
          <T>{"Enter a whole number of minutes from 0 to 1440."}</T>
        </p>
      )}
      <fieldset className="mt-5 grid gap-3">
        <legend className="mb-3">
          <T>{"Events to add"}</T>
        </legend>
        {events.map((event) => (
          <label key={event.id} className="flex items-center gap-3 border border-white/10 p-3">
            <input
              type="checkbox"
              checked={selected.includes(event.id)}
              onChange={(change) =>
                setSelected(
                  change.target.checked
                    ? [...selected, event.id]
                    : selected.filter((id) => id !== event.id),
                )
              }
            />
            <span>
              <T>{event.title}</T>
              <span className="mt-1 block text-xs text-[#9baca7]">
                {!valid && event.id === "wake" ? (
                  <T>{"Enter a valid buffer to preview"}</T>
                ) : (
                  formatCalendarTime(event.start, event.timeZone)
                )}
                {event.start !== event.end && ` – ${formatCalendarTime(event.end, event.timeZone)}`}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        className="primary-button"
        disabled={!valid || !selected.length}
        onClick={async () => {
          try {
            const identified = await assignExportIdentities(
              events.filter((event) => selected.includes(event.id)),
            );
            const url = URL.createObjectURL(
              new Blob([generateICS(identified, new Date().toISOString())], {
                type: "text/calendar;charset=utf-8",
              }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "sixth-of-the-night.ics";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch {
            setExportError("Calendar export could not be prepared. Try again.");
          }
        }}
      >
        <T>{"Download calendar file"}</T>
      </button>
      {exportError && (
        <p role="alert">
          <T>{exportError}</T>
        </p>
      )}
      <p className="mt-4">
        <T>{"Want this to stay aligned with your calendar?"}</T>
      </p>
      <Link className="secondary-button" href="/app">
        <T>{"Use Miqāt"}</T>
      </Link>
      <p className="mt-4 text-xs leading-5 text-[#8ea29d]">
        <T>
          {
            "One-night export for Apple Calendar, Google Calendar, Outlook and other .ics applications. Set notifications in your calendar app. Recalculate and export again if prayer times change."
          }
        </T>
      </p>
    </section>
  );
}
