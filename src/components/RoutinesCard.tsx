"use client";
import { useState } from "react";
import { ROUTINE_TEMPLATES } from "@/lib/routines/templates";
import { humanReadableRule } from "@/lib/routines/resolve";
import {
  validateRoutine,
  ROUTINE_ANCHORS,
  type RoutineAnchor,
  type RoutineRecurrence,
  type RoutineType,
} from "@/lib/routines/model";
import { useDeviceRoutines } from "./app/useDeviceRoutines";
export function RoutinesCard() {
  const { routines, save, loading, error: accountError } = useDeviceRoutines();
  const [name, setName] = useState("");
  const [type, setType] = useState<RoutineType>("quran");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [duration, setDuration] = useState(20);
  const [time, setTime] = useState("06:00");
  const [timingKind, setTimingKind] = useState<"fixed" | "relative">("relative");
  const [anchor, setAnchor] = useState<RoutineAnchor>("fajr");
  const [offset, setOffset] = useState(0);
  const [recurrence, setRecurrence] = useState<RoutineRecurrence>("daily");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [calendarSyncEnabled, setCalendarSyncEnabled] = useState(false);
  const [notificationMinutes, setNotificationMinutes] = useState<number | null>(null);
  async function add() {
    if (!editing && routines.length >= 100) {
      setError("You can save up to 100 routines.");
      return;
    }
    try {
      const now = new Date().toISOString();
      const routine = validateRoutine({
        name,
        type,
        durationMinutes: duration,
        recurrence,
        weekdays,
        calendarSyncEnabled,
        notificationMinutes,
        enabled: editing ? routines.find((r) => r.id === editing)?.enabled : true,
        timing:
          timingKind === "fixed"
            ? { kind: "fixed", time }
            : { kind: "relative", anchor, offsetMinutes: offset },
      });
      const saved = await save(
        editing
          ? routines.map((r) => (r.id === editing ? { ...r, ...routine, updatedAt: now } : r))
          : [...routines, { ...routine, id: crypto.randomUUID(), createdAt: now, updatedAt: now }],
      );
      if (!saved) return;
      setEditing(null);
      setFormOpen(false);
      setName("");
      setError("");
    } catch {
      setError("Enter a valid routine name.");
    }
  }
  return (
    <section
      id="routines"
      className="border border-white/10 bg-[#0c2229] p-5 sm:p-9"
      aria-labelledby="routines-title"
    >
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">ROUTINES</p>
      <h2 id="routines-title" className="mt-3 font-serif text-3xl">
        Personal routines
      </h2>
      <p className="mt-3 text-sm text-[#9baca7]">Routines are saved to your account.</p>
      <h3 className="mt-6 text-xl">Suggested</h3>
      <p className="mt-2 text-sm text-[#9baca7]">
        Optional timing suggestions. Customise and save to add a routine.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROUTINE_TEMPLATES.map((template) => (
          <li key={template.key} className="border border-white/10 p-4">
            <h4>{template.title}</h4>
            <p className="my-2 text-sm text-[#9baca7]">{template.description}</p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setEditing(null);
                setName(template.title);
                setType(template.type);
                setDuration(template.durationMinutes);
                setTimingKind("relative");
                setAnchor(template.anchor);
                setOffset(template.offsetMinutes);
                setRecurrence(template.recurrence);
                setFormOpen(true);
              }}
            >
              Customise {template.title}
            </button>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-xl">My Routines</h3>
      <button
        className="primary-button mt-5"
        onClick={() => {
          setEditing(null);
          setWeekdays([]);
          setCalendarSyncEnabled(false);
          setNotificationMinutes(null);
          setName("");
          setDuration(20);
          setType("quran");
          setTimingKind("relative");
          setAnchor("fajr");
          setOffset(0);
          setRecurrence("daily");
          setFormOpen(true);
        }}
      >
        + Add Custom Routine
      </button>
      {formOpen && (
        <form
          className="account-form mt-6"
          aria-label={editing ? "Edit routine" : "New routine"}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <h3>{editing ? "Edit routine" : "New routine"}</h3>
          <input
            aria-label="Routine name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Qur’an reading"
            className="border border-white/20 bg-[#06151a] px-3 py-2"
          />
          <select
            aria-label="Routine type"
            value={type}
            onChange={(e) => setType(e.target.value as RoutineType)}
            className="border border-white/20 bg-[#06151a] px-3 py-2"
          >
            <option value="quran">Qur’an</option>
            <option value="dhikr">Dhikr</option>
            <option value="qiyam">Qiyām</option>
            <option value="tahajjud">Tahajjud</option>
            <option value="suhoor">Suḥūr</option>
            <option value="sleep-preparation">Sleep preparation</option>
            <option value="custom">Custom</option>
          </select>
          <label>
            Duration (minutes)
            <input
              type="number"
              min={0}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Repeat
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as RoutineRecurrence)}
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="friday">Friday</option>
              <option value="monday">Monday</option>
              <option value="thursday">Thursday</option>
              <option value="selected-weekdays">Selected weekdays</option>
              <option value="white-days">White Days (arithmetic calendar)</option>
              <option value="fasting-days">Enabled fasting days</option>
            </select>
          </label>
          {recurrence === "selected-weekdays" && (
            <fieldset>
              <legend>Weekdays</legend>
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
                (day, index) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={weekdays.includes(index + 1)}
                      onChange={(e) =>
                        setWeekdays(
                          e.target.checked
                            ? [...weekdays, index + 1]
                            : weekdays.filter((d) => d !== index + 1),
                        )
                      }
                    />
                    {day}
                  </label>
                ),
              )}
            </fieldset>
          )}
          <label>
            Calendar
            <select disabled>
              <option>Google primary calendar</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={calendarSyncEnabled}
              onChange={(e) => setCalendarSyncEnabled(e.target.checked)}
            />
            Calendar sync
          </label>
          <label>
            Notification
            <select
              value={notificationMinutes ?? "none"}
              onChange={(e) =>
                setNotificationMinutes(e.target.value === "none" ? null : Number(e.target.value))
              }
            >
              <option value="none">None</option>
              {[0, 5, 10, 15, 30].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? "At event time" : `${minutes} minutes before`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Timing
            <select
              value={timingKind}
              onChange={(e) => setTimingKind(e.target.value as "fixed" | "relative")}
            >
              <option value="relative">Relative to prayer</option>
              <option value="fixed">Fixed time</option>
            </select>
          </label>
          {timingKind === "fixed" ? (
            <label>
              Time
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
          ) : (
            <>
              <label>
                Anchor
                <select value={anchor} onChange={(e) => setAnchor(e.target.value as typeof anchor)}>
                  {ROUTINE_ANCHORS.map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Offset preset
                <select
                  value={
                    [0, -5, -10, -15, -30, -45, -60, 5, 10, 15, 30, 45, 60].includes(offset)
                      ? String(offset)
                      : "custom"
                  }
                  onChange={(e) => {
                    if (e.target.value !== "custom") setOffset(Number(e.target.value));
                  }}
                >
                  <option value="0">Immediately</option>
                  {[-5, -10, -15, -30, -45, -60, 5, 10, 15, 30, 45, 60].map((n) => (
                    <option key={n} value={n}>
                      {Math.abs(n)} minutes {n < 0 ? "before" : "after"}
                    </option>
                  ))}
                  <option value="custom">Custom offset</option>
                </select>
              </label>
              <label>
                Offset (minutes)
                <input
                  type="number"
                  min={-1440}
                  max={1440}
                  value={offset}
                  onChange={(e) => setOffset(Number(e.target.value))}
                  required
                />
              </label>
            </>
          )}
          <div className="form-actions">
            <button type="submit" className="primary-button">
              Save routine
            </button>
            <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {loading && <p role="status">Loading account routines…</p>}
      {accountError && <p role="alert">{accountError}</p>}
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          {error}
        </p>
      )}
      <ul className="mt-5 grid gap-2">
        {routines.map((routine) => (
          <li
            key={routine.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4 text-sm"
          >
            <span>
              {routine.name} · {routine.type} · {routine.durationMinutes} minutes
              <span className="mt-2 block text-[#9baca7]">
                {humanReadableRule(routine)} · {routine.recurrence} ·{" "}
                {routine.enabled ? "Enabled" : "Disabled"}
              </span>
            </span>
            <div className="form-actions">
              <button
                onClick={() => {
                  setEditing(routine.id);
                  setName(routine.name);
                  setType(routine.type);
                  setDuration(routine.durationMinutes);
                  setRecurrence(routine.recurrence);
                  setWeekdays(routine.weekdays ?? []);
                  setCalendarSyncEnabled(routine.calendarSyncEnabled ?? false);
                  setNotificationMinutes(routine.notificationMinutes ?? null);
                  setTimingKind(routine.timing.kind);
                  if (routine.timing.kind === "fixed") setTime(routine.timing.time);
                  else {
                    setAnchor(routine.timing.anchor);
                    setOffset(routine.timing.offsetMinutes);
                  }
                  setFormOpen(true);
                }}
              >
                Edit
              </button>
              <button
                onClick={() =>
                  save(
                    routines.map((r) =>
                      r.id === routine.id
                        ? { ...r, enabled: !r.enabled, updatedAt: new Date().toISOString() }
                        : r,
                    ),
                  )
                }
              >
                {routine.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                className="text-[#d0ae67]"
                onClick={() => save(routines.filter((item) => item.id !== routine.id))}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
