"use client";
import { useState } from "react";
import { validateRoutine, type Routine, type RoutineType } from "@/lib/routines/model";
const key = "miqat.routines.v1";
function read(): Routine[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as Routine[];
  } catch {
    return [];
  }
}
export function RoutinesCard() {
  const [routines, setRoutines] = useState<Routine[]>(() =>
    typeof window === "undefined" ? [] : read(),
  );
  const [name, setName] = useState("");
  const [type, setType] = useState<RoutineType>("quran");
  const [error, setError] = useState("");
  function save(next: Routine[]) {
    setRoutines(next);
    localStorage.setItem(key, JSON.stringify(next));
  }
  function add() {
    if (routines.length >= 5) {
      setError("The Free plan supports up to five saved routines.");
      return;
    }
    try {
      const now = new Date().toISOString();
      const routine = validateRoutine({
        name,
        type,
        durationMinutes: 20,
        timing: { kind: "relative", anchor: "fajr", offsetMinutes: 0 },
      });
      save([...routines, { ...routine, id: crypto.randomUUID(), createdAt: now, updatedAt: now }]);
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
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
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
        <button
          type="button"
          className="border border-[#d0ae67] px-4 py-2 text-[#d0ae67]"
          onClick={add}
        >
          Add routine
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-red-300">
          {error}
        </p>
      )}
      <ul className="mt-5 grid gap-2">
        {routines.map((routine) => (
          <li
            key={routine.id}
            className="flex items-center justify-between border border-white/10 p-3 text-sm"
          >
            <span>
              {routine.name} · {routine.type} · {routine.durationMinutes} minutes
            </span>
            <button
              type="button"
              className="text-[#d0ae67]"
              onClick={() => save(routines.filter((item) => item.id !== routine.id))}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
