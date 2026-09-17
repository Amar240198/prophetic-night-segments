"use client";

import { useMemo, useState } from "react";
import type { DailyPrayerSchedule } from "@/lib/calendar/buildCalendarEvents";
import { buildDailyPrayerEvents } from "@/lib/calendar/buildCalendarEvents";
import { assignExportIdentities } from "@/lib/calendar/exportIdentity";
import { generateICS } from "@/lib/calendar/generateICS";
import type { SyncContext } from "@/lib/google-calendar/sync";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { loadPreferences, savePreferences } from "@/lib/product/preferences";

const requiredIds = ["prayer-fajr", "prayer-dhuhr", "prayer-asr", "prayer-maghrib", "prayer-isha"];

function clock(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function AllPrayersCard({
  schedule,
  syncContext,
}: {
  schedule: DailyPrayerSchedule;
  syncContext?: SyncContext | null;
}) {
  const [selected, setSelected] = useState(() => {
    if (typeof window === "undefined") return requiredIds;
    const saved = loadPreferences().selectedPrayers.map((id) => `prayer-${id}`);
    return saved.length ? saved : requiredIds;
  });
  const [now] = useState(() => Date.now());
  const [error, setError] = useState("");
  const events = useMemo(() => buildDailyPrayerEvents(schedule), [schedule]);
  const selectedEvents = events.filter((event) => selected.includes(event.id));
  const sunrise = schedule.sunrise;
  function updateSelection(next: string[]) {
    setSelected(next);
    if (typeof window !== "undefined")
      savePreferences({
        ...loadPreferences(),
        selectedPrayers: next.map((id) => id.replace(/^prayer-/, "")),
      });
  }
  async function download() {
    try {
      const identities = await assignExportIdentities(selectedEvents);
      const blob = new Blob([generateICS(identities, new Date().toISOString())], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `miqat-prayers-${schedule.date}.ics`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("The prayer calendar file could not be downloaded.");
    }
  }
  const display = (id: string) => {
    const event = events.find((item) => item.id === id);
    return event ? clock(event.start, schedule.timeZone) : "—";
  };
  const nextPrayer = events.find((event) => Date.parse(event.start) > now);
  return (
    <section
      id="all-prayers"
      className="border border-white/10 bg-[#0c2229] p-5 sm:p-9"
      aria-labelledby="all-prayers-title"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">ALL PRAYERS</p>
      <h2 id="all-prayers-title" className="mt-3 font-serif text-3xl">
        Today’s prayer timetable
      </h2>
      <p className="mt-2 text-sm text-[#9baca7]">
        {schedule.date} · {schedule.source}
      </p>
      <p className="mt-3 text-sm text-[#d0ae67]" aria-live="polite">
        Next prayer: {nextPrayer?.title ?? "Fajr tomorrow"}
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {[
          ["Fajr", "prayer-fajr"],
          ["Sunrise", "sunrise"],
          ["Dhuhr", "prayer-dhuhr"],
          ["Asr", "prayer-asr"],
          ["Maghrib", "prayer-maghrib"],
          ["Isha", "prayer-isha"],
        ].map(([label, id]) => (
          <div
            key={id}
            className="flex items-center justify-between border border-white/10 bg-[#06151a] px-4 py-3"
          >
            <span className={id === "sunrise" ? "text-[#9baca7]" : "text-white"}>
              {label}
              {id === "sunrise" && <span className="ml-2 text-xs">informational</span>}
            </span>
            <span className="font-semibold text-[#d0ae67]">
              {id === "sunrise" ? sunrise : display(id)}
            </span>
          </div>
        ))}
      </div>
      <fieldset className="mt-6 grid gap-2">
        <legend className="mb-2 text-sm font-semibold">Prayers to add or sync</legend>
        {events.map((event) => (
          <label
            key={event.id}
            className="flex items-center gap-3 border border-white/10 p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.includes(event.id)}
              onChange={(change) =>
                updateSelection(
                  change.target.checked
                    ? [...selected, event.id]
                    : selected.filter((id) => id !== event.id),
                )
              }
            />
            <span>
              {event.title}
              <span className="mt-1 block text-xs text-[#9baca7]">
                {clock(event.start, schedule.timeZone)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className="border border-[#d0ae67] px-5 py-3 font-semibold text-[#d0ae67]"
          onClick={() => updateSelection(requiredIds)}
        >
          Add all prayers
        </button>
        <button
          type="button"
          className="border border-white/20 px-5 py-3"
          disabled={!selectedEvents.length}
          onClick={() => void download()}
        >
          Download selected (.ics)
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          {error}
        </p>
      )}
      <GoogleCalendarSection
        key={selected.join(",")}
        events={events}
        valid
        localNight={schedule.date}
        syncContext={syncContext}
        syncOptions={{
          wakeBufferMinutes: 0,
          dawudSelected: false,
          fajrPreparationMinutes: 0,
          firstAdhanMinutes: null,
        }}
        moduleTitle="All Prayers"
        defaultSelected={selected}
      />
    </section>
  );
}
