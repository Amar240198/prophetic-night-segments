"use client";
import { T, useI18n } from "@/components/i18n/LocaleProvider";
import { useState } from "react";
import { ROUTINE_TEMPLATES } from "@/lib/routines/templates";
import { RoutineRule } from "@/components/i18n/RoutineRule";
import { ANCHOR_LABELS, ROUTINE_TYPE_LABELS, RECURRENCE_LABELS } from "@/lib/i18n/labels";
import {
  validateRoutine,
  ROUTINE_ANCHORS,
  type RoutineAnchor,
  type RoutineRecurrence,
  type RoutineType,
} from "@/lib/routines/model";
import { useDeviceRoutines } from "./app/useDeviceRoutines";
export function RoutinesCard() {
  const { t } = useI18n();
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
      <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">
        <T>{"ROUTINES"}</T>
      </p>
      <h2 id="routines-title" className="mt-3 font-serif text-3xl">
        <T>{"Personal routines"}</T>
      </h2>
      <p className="mt-3 text-sm text-[#9baca7]">
        <T>{"Routines are saved to your account."}</T>
      </p>
      <h3 className="mt-6 text-xl">
        <T>{"Suggested"}</T>
      </h3>
      <p className="mt-2 text-sm text-[#9baca7]">
        <T>{"Optional timing suggestions. Customise and save to add a routine."}</T>
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {ROUTINE_TEMPLATES.map((template) => (
          <li key={template.key} className="border border-white/10 p-4">
            <h4>
              <T>{template.title}</T>
            </h4>
            <p className="my-2 text-sm text-[#9baca7]">
              <T>{template.description}</T>
            </p>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setEditing(null);
                setName(t(template.title));
                setType(template.type);
                setDuration(template.durationMinutes);
                setTimingKind("relative");
                setAnchor(template.anchor);
                setOffset(template.offsetMinutes);
                setRecurrence(template.recurrence);
                setFormOpen(true);
              }}
            >
              <T>{"Customise "}</T>
              <T>{template.title}</T>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="mt-6 text-xl">
        <T>{"My Routines"}</T>
      </h3>
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
        <T>{"+ Add Custom Routine"}</T>
      </button>
      {formOpen && (
        <form
          className="account-form mt-6"
          aria-label={t(editing ? "Edit routine" : "New routine")}
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <h3>
            <T>{editing ? "Edit routine" : "New routine"}</T>
          </h3>
          <input
            aria-label={t("Routine name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Qur’an reading")}
            className="border border-white/20 bg-[#06151a] px-3 py-2"
          />
          <select
            aria-label={t("Routine type")}
            value={type}
            onChange={(e) => {
              const next = e.target.value as RoutineType;
              setType(next);
              if (next === "qaylula") {
                setTimingKind("relative");
                setAnchor("dhuhr");
                setDuration(Math.max(1, duration));
              }
            }}
            className="border border-white/20 bg-[#06151a] px-3 py-2"
          >
            <option value="qaylula">
              <T>{"Qaylula"}</T>
            </option>
            <option value="quran">
              <T>{"Qur’an"}</T>
            </option>
            <option value="dhikr">
              <T>{"Dhikr"}</T>
            </option>
            <option value="qiyam">
              <T>{"Qiyām"}</T>
            </option>
            <option value="tahajjud">
              <T>{"Tahajjud"}</T>
            </option>
            <option value="suhoor">
              <T>{"Suḥūr"}</T>
            </option>
            <option value="sleep-preparation">
              <T>{"Sleep preparation"}</T>
            </option>
            <option value="custom">
              <T>{"Custom"}</T>
            </option>
          </select>
          <label>
            <T>{"Duration (minutes)"}</T>
            <input
              type="number"
              min={type === "qaylula" ? 1 : 0}
              max={1440}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              required
            />
          </label>
          <label>
            <T>{"Repeat"}</T>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as RoutineRecurrence)}
            >
              <option value="daily">
                <T>{"Every day"}</T>
              </option>
              <option value="weekdays">
                <T>{"Weekdays"}</T>
              </option>
              <option value="friday">
                <T>{"Friday"}</T>
              </option>
              <option value="monday">
                <T>{"Monday"}</T>
              </option>
              <option value="thursday">
                <T>{"Thursday"}</T>
              </option>
              <option value="selected-weekdays">
                <T>{"Selected weekdays"}</T>
              </option>
              <option value="white-days">
                <T>{"White Days (arithmetic calendar)"}</T>
              </option>
              <option value="fasting-days">
                <T>{"Enabled fasting days"}</T>
              </option>
            </select>
          </label>
          {recurrence === "selected-weekdays" && (
            <fieldset>
              <legend>
                <T>{"Weekdays"}</T>
              </legend>
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
                    <T>{day}</T>
                  </label>
                ),
              )}
            </fieldset>
          )}
          <label>
            <T>{"Calendar"}</T>
            <select disabled>
              <option value="primary">
                <T>{"Google primary calendar"}</T>
              </option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={calendarSyncEnabled}
              onChange={(e) => setCalendarSyncEnabled(e.target.checked)}
            />
            <T>{"Calendar sync"}</T>
          </label>
          <label>
            <T>{"Notification"}</T>
            <select
              value={notificationMinutes ?? "none"}
              onChange={(e) =>
                setNotificationMinutes(e.target.value === "none" ? null : Number(e.target.value))
              }
            >
              <option value="none">
                <T>{"None"}</T>
              </option>
              {[0, 5, 10, 15, 30].map((minutes) => (
                <option key={minutes} value={minutes}>
                  <T values={{ minutes }}>
                    {minutes === 0 ? "At event time" : "{minutes} minutes before"}
                  </T>
                </option>
              ))}
            </select>
          </label>
          <label>
            <T>{"Timing"}</T>
            <select
              value={timingKind}
              disabled={type === "qaylula"}
              onChange={(e) => setTimingKind(e.target.value as "fixed" | "relative")}
            >
              <option value="relative">
                <T>{"Relative to prayer"}</T>
              </option>
              <option value="fixed">
                <T>{"Fixed time"}</T>
              </option>
            </select>
          </label>
          {timingKind === "fixed" ? (
            <label>
              <T>{"Time"}</T>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
          ) : (
            <>
              <label>
                <T>{"Anchor"}</T>
                <select
                  disabled={type === "qaylula"}
                  value={anchor}
                  onChange={(e) => setAnchor(e.target.value as typeof anchor)}
                >
                  {ROUTINE_ANCHORS.map((value) => (
                    <option key={value} value={value}>
                      <T>{ANCHOR_LABELS[value]}</T>
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <T>{"Offset preset"}</T>
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
                  <option value="0">
                    <T>{"Immediately"}</T>
                  </option>
                  {[-5, -10, -15, -30, -45, -60, 5, 10, 15, 30, 45, 60].map((n) => (
                    <option key={n} value={n}>
                      {Math.abs(n)}
                      <T>{" minutes "}</T>
                      <T>{n < 0 ? "before" : "after"}</T>
                    </option>
                  ))}
                  <option value="custom">
                    <T>{"Custom offset"}</T>
                  </option>
                </select>
              </label>
              <label>
                <T>{"Offset (minutes)"}</T>
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
              <T>{"Save routine"}</T>
            </button>
            <button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>
              <T>{"Cancel"}</T>
            </button>
          </div>
        </form>
      )}
      {loading && (
        <p role="status">
          <T>{"Loading account routines…"}</T>
        </p>
      )}
      {accountError && (
        <p role="alert">
          <T>{accountError}</T>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          <T>{error}</T>
        </p>
      )}
      <ul className="mt-5 grid gap-2">
        {routines.map((routine) => (
          <li
            key={routine.id}
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4 text-sm"
          >
            <span>
              {routine.name} · <T>{ROUTINE_TYPE_LABELS[routine.type]}</T> ·{" "}
              {routine.durationMinutes}
              <T>{" minutes"}</T>
              <span className="mt-2 block text-[#9baca7]">
                <RoutineRule routine={routine} /> · <T>{RECURRENCE_LABELS[routine.recurrence]}</T> ·{" "}
                <T>{routine.enabled ? "Enabled" : "Disabled"}</T>
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
                <T>{"Edit"}</T>
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
                <T>{routine.enabled ? "Disable" : "Enable"}</T>
              </button>
              <button
                type="button"
                className="text-[#d0ae67]"
                onClick={() => save(routines.filter((item) => item.id !== routine.id))}
              >
                <T>{"Delete"}</T>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
