"use client";
import Link from "next/link";
import { useCalendarSyncStatus } from "./calendarStatus";
import { useEffect, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { buildDailyPrayerEvents } from "@/lib/calendar/buildCalendarEvents";
import { fastingDates } from "@/lib/fasting/schedule";
import { useDeviceRoutines } from "./useDeviceRoutines";
import { useFastingSettings } from "./useFastingSettings";
import { useWorkspace } from "./PrayerWorkspace";
import { Card, PageHeader } from "./ui";
export function CalendarSummary() {
  const lastSync = useCalendarSyncStatus();
  const [status, setStatus] = useState("Checking connection…");
  useEffect(() => {
    let active = true;
    fetch("/api/google-calendar/session")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        if (active)
          setStatus(
            data.connected ? `Connected${data.email ? ` · ${data.email}` : ""}` : "Disconnected",
          );
      })
      .catch(() => {
        if (active) setStatus("Connection could not be checked");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <p>Google Calendar: {status}</p>
      <p>Last sync: {lastSync ?? "no report available in this session."}</p>
    </>
  );
}
export function TodayPage() {
  const { schedule, result, timeZone } = useWorkspace();
  const [now, setNow] = useState<number | null>(null);
  const { routines } = useDeviceRoutines();
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);
  const date = now
    ? Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone).toPlainDate()
    : null;
  const dateString = date?.toString();
  const events = schedule && schedule.date === dateString ? buildDailyPrayerEvents(schedule) : [];
  const next = now
    ? (events.find((e) => Date.parse(e.start) > now) ??
      (events.length && result && Date.parse(result.night.end) > now
        ? { title: "Fajr", start: result.night.end }
        : undefined))
    : undefined;
  const display = (value: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
      new Date(value),
    );
  const fasting = useFastingSettings(dateString ?? new Date().toISOString().slice(0, 10));
  const fast = dateString
    ? fastingDates(dateString, 90, fasting.selected, {
        date: fasting.anchorDate,
        fasting: fasting.anchorFasting,
      })[0]
    : null;
  const due = routines.filter(
    (r) => r.enabled && (r.recurrence === "daily" || (date && date.dayOfWeek <= 5)),
  );
  return (
    <>
      <PageHeader
        title="Today"
        description={
          now
            ? new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "full" }).format(now)
            : "Your day at a glance"
        }
      />
      <div className="dashboard-grid">
        <Card title="Next prayer">
          {next ? (
            <>
              <div className="summary-value">
                {next.title} · {display(next.start)}
              </div>
              <p>In {Math.ceil((Date.parse(next.start) - now!) / 60000)} minutes</p>
            </>
          ) : (
            <p>
              {events.length
                ? "Today’s prayers have passed. Open All Prayers for the next date."
                : "Choose your source in All Prayers to load today’s times."}
            </p>
          )}
          <Link className="module-link" href="/app/prayers">
            All Prayers →
          </Link>
        </Card>
        <Card title="Prayers today">
          {events.length ? (
            <dl className="summary-list">
              {events.map((e) => (
                <div key={e.id}>
                  <dt>{e.title}</dt>
                  <dd>{display(e.start)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>
              Fajr · Dhuhr · Asr · Maghrib · Isha
              <br />
              Timetable not yet loaded for today.
            </p>
          )}
          <Link className="module-link" href="/app/prayers">
            View timetable →
          </Link>
        </Card>
        <Card title="Night">
          {result &&
          Temporal.Instant.from(result.night.start)
            .toZonedDateTimeISO(timeZone)
            .toPlainDate()
            .toString() === dateString ? (
            <dl className="summary-list">
              {[
                ["Maghrib", result.night.start],
                ["Fajr", result.night.end],
                ["Last third", result.lastThird.start],
                ["Final sixth", result.dawudPattern.finalSleep.start],
              ].map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{display(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Calculate tonight to see Maghrib, following Fajr, the last third and final sixth.</p>
          )}
          <Link className="module-link" href="/app/sixth">
            Open Sixth →
          </Link>
        </Card>
        <Card title="Fasting">
          <p>Next suggested fast: {fast?.date ?? "—"}</p>
          <p>
            Active programmes:{" "}
            {fasting.selected.length
              ? fasting.selected
                  .map(
                    (p) =>
                      ({
                        monday: "Monday",
                        thursday: "Thursday",
                        "white-days": "White Days",
                        dawud: "Dāwūd",
                      })[p],
                  )
                  .join(", ")
              : "None"}
            .
          </p>
          <Link className="module-link" href="/app/fasting">
            Fasting programmes →
          </Link>
        </Card>
        <Card title="Routines">
          {due.length ? (
            <ul>
              {due.map((r) => (
                <li key={r.id}>
                  {r.name} · {r.durationMinutes} minutes
                </li>
              ))}
            </ul>
          ) : (
            <p>No enabled routines due today on this device.</p>
          )}
          <Link className="module-link" href="/app/routines">
            Manage routines →
          </Link>
        </Card>
        <Card title="Calendar">
          <CalendarSummary />
          <Link className="module-link" href="/app/calendar">
            Manage calendar →
          </Link>
        </Card>
      </div>
    </>
  );
}
