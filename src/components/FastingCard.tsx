"use client";
import { useMemo, useState } from "react";
import { buildFastingCalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { assignExportIdentities } from "@/lib/calendar/exportIdentity";
import { generateICS } from "@/lib/calendar/generateICS";
import { fastingDates, type FastingProgramme } from "@/lib/fasting/schedule";
import { useFastingSettings } from "./app/useFastingSettings";
import { GoogleCalendarSection } from "./GoogleCalendarSection";

const choices: Array<[FastingProgramme, string]> = [
  ["monday", "Monday"],
  ["thursday", "Thursday"],
  ["white-days", "White Days"],
  ["dawud", "Dāwūd"],
];
export function FastingCard({
  date = new Date().toISOString().slice(0, 10),
  timeZone = "Europe/London",
}: {
  date?: string;
  timeZone?: string;
}) {
  const { selected, anchorDate, anchorFasting, save } = useFastingSettings(date);
  const [showCalendar, setShowCalendar] = useState(false);
  const upcoming = useMemo(
    () =>
      fastingDates(date, 90, selected, { date: anchorDate, fasting: anchorFasting }).slice(0, 8),
    [date, selected, anchorDate, anchorFasting],
  );
  const events = upcoming.map((item) => buildFastingCalendarEvent(item.date, item.kind, timeZone));
  async function download() {
    const identities = await assignExportIdentities(events);
    const blob = new Blob([generateICS(identities, new Date().toISOString())], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `miqat-fasting-${date}.ics`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      id="fasting"
      className="border border-white/10 bg-[#0c2229] p-5 sm:p-9"
      aria-labelledby="fasting-title"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">FASTING</p>
      <h2 id="fasting-title" className="mt-3 font-serif text-3xl">
        Fasting schedules
      </h2>
      <p className="mt-2 text-sm text-[#9baca7]">Next fast: {upcoming[0]?.date ?? "—"}</p>
      <fieldset className="mt-5 grid gap-2">
        {choices.map(([id, label]) => (
          <label key={id} className="flex items-center gap-3 border border-white/10 p-3">
            <input
              type="checkbox"
              checked={selected.includes(id)}
              onChange={(e) =>
                save({
                  selected: e.target.checked
                    ? [...selected, id]
                    : selected.filter((value) => value !== id),
                })
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      {selected.includes("dawud") && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Dāwūd starting date
            <input
              type="date"
              value={anchorDate}
              onChange={(e) => save({ anchorDate: e.target.value })}
              className="border border-white/20 bg-[#06151a] px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={anchorFasting}
              onChange={(e) => save({ anchorFasting: e.target.checked })}
            />
            Starting date is a fasting day
          </label>
        </div>
      )}
      <h3 className="mt-6 font-semibold">Upcoming fasting dates</h3>
      <ul className="mt-5 grid gap-2 text-sm">
        {upcoming.map((item) => (
          <li key={`${item.date}-${item.kind}`} className="border border-white/10 px-3 py-2">
            {item.date} · {item.kind.replace("fasting-", "")}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          className="border border-[#d0ae67] px-4 py-2 text-[#d0ae67]"
          onClick={() => void download()}
        >
          Download schedule (.ics)
        </button>
        {events[0] && (
          <button
            type="button"
            className="border border-white/20 px-4 py-2"
            onClick={() => setShowCalendar((value) => !value)}
          >
            Add next fast to Google Calendar
          </button>
        )}
      </div>
      <p className="mt-5 text-sm text-[#9baca7]">Ramadan planning is coming later.</p>
      {showCalendar && events[0] && (
        <GoogleCalendarSection
          key={events[0].id + events[0].serviceDate}
          events={[events[0]]}
          valid
          localNight={events[0].serviceDate}
          moduleTitle="Fasting"
          defaultSelected={[events[0].id]}
        />
      )}
    </section>
  );
}
