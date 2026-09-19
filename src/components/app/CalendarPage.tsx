"use client";
import Link from "next/link";
import { AutomationControl } from "./AutomationControl";
import { useCalendarSyncStatus } from "./calendarStatus";
import { useState } from "react";
import { GoogleCalendarSection } from "@/components/GoogleCalendarSection";
import { buildGooglePlan } from "@/lib/google-calendar/plan";
import { buildDailyPrayerEvents } from "@/lib/calendar/buildCalendarEvents";
import { useWorkspace } from "./PrayerWorkspace";
import { Card, PageHeader } from "./ui";
export function CalendarPage() {
  const lastSync = useCalendarSyncStatus();
  const { result, schedule, syncContext, settings } = useWorkspace();
  const [modules, setModules] = useState<string[]>(["prayers", "sixth"]);
  const options = {
    wakeBufferMinutes: 15,
    dawudSelected: false,
    fajrPreparationMinutes: 20,
    firstAdhanMinutes: null,
  };
  const events = [
    ...(schedule && modules.includes("prayers") ? buildDailyPrayerEvents(schedule) : []),
    ...(result && modules.includes("sixth")
      ? buildGooglePlan(result, { ...options, prayerSource: schedule?.source ?? "Supplied times" })
      : []),
  ];
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Connect your calendar, choose what to sync and manage verified Miqāt events."
      />
      <AutomationControl />
      <details>
        <summary>Existing calendar tools</summary>
        <Card title="Sync modules">
          <fieldset className="grid gap-3">
            <legend className="mb-3">Include in this sync</legend>
            {[
              ["prayers", "All Prayers"],
              ["sixth", "Sixth"],
            ].map(([id, label]) => (
              <label key={id} className="flex gap-3">
                <input
                  type="checkbox"
                  checked={modules.includes(id)}
                  onChange={(e) =>
                    setModules((current) =>
                      e.target.checked ? [...current, id] : current.filter((value) => value !== id),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="mt-4">
            These controls manage individual prayer and night selections. Use Calendar automation
            above for account routines.
          </p>
          <div className="form-actions">
            <Link href="/app/fasting" className="secondary-button">
              Fasting calendar
            </Link>
            <Link href="/app/routines" className="secondary-button">
              Routines
            </Link>
          </div>
        </Card>
        <Card title="Google Calendar">
          <p>Last sync: {lastSync ?? "No report available in this session."}</p>
          <p>
            Sync horizon and managed-event cleanup appear when connected. Last sync results appear
            after an operation in this session.
          </p>
          <GoogleCalendarSection
            key={modules.join(",")}
            events={events}
            valid={events.length > 0}
            syncContext={syncContext}
            syncOptions={options}
            localNight={syncContext?.startDate ?? schedule?.date}
            moduleTitle="selected modules"
          />
        </Card>
      </details>
      <details className="settings-panel" open={!result}>
        <summary>Schedule source and date</summary>
        {settings}
      </details>
    </>
  );
}
