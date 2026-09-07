"use client";

import { useState } from "react";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { DEFAULT_BUFFER_BEFORE_FAJR_MINUTES } from "./ScheduleTools";
import { buildGooglePlan } from "@/lib/google-calendar/plan";
import type { NightCalculationResult } from "@prophetic-night/night-engine";
import { buildCalendarEvents, formatCalendarTime } from "@/lib/calendar/buildCalendarEvents";
import { generateICS } from "@/lib/calendar/generateICS";
import { googleCalendarUrl } from "@/lib/calendar/googleCalendarUrl";

export function CalendarCard({
  result,
  dawudSelected,
  prayerSource,
  firstAdhanMinutes = null,
}: {
  result: NightCalculationResult;
  dawudSelected: boolean;
  prayerSource: string;
  firstAdhanMinutes?: number | null;
}) {
  const [buffer, setBuffer] = useState("15");
  const [custom, setCustom] = useState("15");
  const [selected, setSelected] = useState(["wake", "last-third", "fajr"]);
  const [downloadError, setDownloadError] = useState("");
  const value = buffer === "custom" ? custom : buffer;
  const minutes = value.trim() === "" ? NaN : Number(value);
  const valid = Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440;
  const events = buildCalendarEvents(result, {
    wakeBufferMinutes: valid ? minutes : 0,
    pattern: dawudSelected ? "dawud" : "last-third",
    prayerSource,
  });
  const chosen = events.filter((event) => selected.includes(event.id));
  function download() {
    if (!valid || !chosen.length) return;
    setDownloadError("");
    try {
      const url = URL.createObjectURL(
        new Blob([generateICS(chosen, new Date().toISOString())], {
          type: "text/calendar;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "prophetic-night-segments-qiyam.ics";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError("The calendar file could not be downloaded. Please try again.");
    }
  }
  return (
    <section
      className="border border-white/10 bg-[#0c2229] p-5 sm:p-9"
      aria-labelledby="calendar-title"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">CALENDAR</p>
      <h2 id="calendar-title" className="mt-3 font-serif text-3xl">
        Add to Calendar
      </h2>
      <p className="mt-3 text-[#c8d4d0]">Plan tonight around Qiyam.</p>
      <p className="mt-2 text-sm text-[#9baca7]">
        Suggested prayer window:{" "}
        {dawudSelected ? "Dāwūd pattern (Parts 4–5)" : "last third (Parts 5–6)"}. Times shown in{" "}
        {result.input.timeZone}.
      </p>
      <label className="mt-5 grid gap-2 text-sm">
        Wake-up buffer
        <select
          value={buffer}
          onChange={(event) => setBuffer(event.target.value)}
          className="border border-white/20 bg-[#06151a] px-3 py-2"
        >
          {[0, 5, 10, 15, 20, 30].map((option) => (
            <option key={option} value={option}>
              {option} minutes
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {buffer === "custom" && (
        <label className="mt-3 grid gap-2 text-sm">
          Custom wake-up buffer (minutes)
          <input
            type="number"
            min="0"
            max="1440"
            step="1"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            aria-invalid={!valid}
            aria-describedby={!valid ? "calendar-buffer-error" : undefined}
            className="border border-white/20 bg-[#06151a] px-3 py-2"
          />
        </label>
      )}
      {!valid && (
        <p id="calendar-buffer-error" role="alert" className="mt-3 text-red-300">
          Enter a whole number of minutes from 0 to 1440.
        </p>
      )}
      <fieldset className="mt-5 grid gap-3">
        <legend className="mb-3">Events to add</legend>
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
              {event.title}
              <span className="mt-1 block text-xs text-[#9baca7]">
                {!valid && event.id === "wake"
                  ? "Enter a valid buffer to preview"
                  : formatCalendarTime(event.start, event.timeZone)}
                {event.id === "prayer" && ` – ${formatCalendarTime(event.end, event.timeZone)}`}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        onClick={download}
        disabled={!valid || !chosen.length}
        className="mt-6 border border-[#d0ae67] px-5 py-3 font-semibold text-[#d0ae67] hover:bg-[#d0ae67]/10 disabled:opacity-40"
      >
        Download Calendar File (.ics)
      </button>
      {!chosen.length && <p className="mt-3 text-sm">Select at least one event to export.</p>}
      {downloadError && (
        <p role="alert" className="mt-3 text-red-300">
          {downloadError}
        </p>
      )}
      {valid && chosen.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-[#d0ae67]">Add to Google Calendar</summary>
          <p className="mt-2 text-sm text-[#9baca7]">
            Open and save each selected event in Google Calendar, or import the .ics file for all
            events. Google may ask you to sign in.
          </p>
          <ul className="mt-3 space-y-3">
            {chosen.map((event) => (
              <li key={event.id}>
                <a
                  href={googleCalendarUrl(event)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#d0ae67] underline"
                >
                  {event.title} (opens in a new tab)
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <GoogleCalendarSection
        valid={valid}
        events={buildGooglePlan(result, {
          wakeBufferMinutes: valid ? minutes : 0,
          dawudSelected,
          prayerSource,
          fajrPreparationMinutes: DEFAULT_BUFFER_BEFORE_FAJR_MINUTES,
          firstAdhanMinutes,
        })}
      />
      <p className="mt-4 text-xs leading-5 text-[#8ea29d]">
        One-night export for Apple Calendar, Google Calendar, Outlook and other .ics applications.
        Set notifications in your calendar app. Recalculate and export again if prayer times change.
      </p>
    </section>
  );
}
