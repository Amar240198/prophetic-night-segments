"use client";
import { useState } from "react";
import { validateRoutine, type RoutineType } from "@/lib/routines/model";
import { useDeviceRoutines } from "./app/useDeviceRoutines";
export function RoutinesCard() {
  const { routines, save } = useDeviceRoutines();
  const [name, setName] = useState("");
  const [type, setType] = useState<RoutineType>("quran");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [duration, setDuration] = useState(20);
  const [time, setTime] = useState("06:00");
  const [timingKind, setTimingKind] = useState<"fixed" | "relative">("relative");
  const [anchor, setAnchor] = useState<"fajr" | "maghrib" | "isha" | "last-third">("fajr");
  const [offset, setOffset] = useState(0);
  const [recurrence, setRecurrence] = useState<"daily" | "weekdays">("daily");
  function add() {
    if (!editing && routines.length >= 5) {
      setError("The Free plan supports up to five saved routines.");
      return;
    }
    try {
      const now = new Date().toISOString();
      const routine = validateRoutine({
        name,
        type,
        durationMinutes: duration,
        recurrence,
        enabled: editing ? routines.find((r) => r.id === editing)?.enabled : true,
        timing:
          timingKind === "fixed"
            ? { kind: "fixed", time }
            : { kind: "relative", anchor, offsetMinutes: offset },
      });
      save(
        editing
          ? routines.map((r) => (r.id === editing ? { ...r, ...routine, updatedAt: now } : r))
          : [...routines, { ...routine, id: crypto.randomUUID(), createdAt: now, updatedAt: now }],
      );
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
      <p className="mt-3 text-sm text-[#9baca7]">Routines are saved on this device.</p>
      <button
        className="primary-button mt-5"
        onClick={() => {
          setEditing(null);
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
        + Add routine
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
              onChange={(e) => setRecurrence(e.target.value as "daily" | "weekdays")}
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
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
                  <option value="fajr">Fajr</option>
                  <option value="maghrib">Maghrib</option>
                  <option value="isha">Isha</option>
                  <option value="last-third">Last third</option>
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
                {routine.timing.kind === "fixed"
                  ? routine.timing.time
                  : `${routine.timing.offsetMinutes} min from ${routine.timing.anchor}`}{" "}
                · {routine.recurrence} · {routine.enabled ? "Enabled" : "Disabled"}
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
