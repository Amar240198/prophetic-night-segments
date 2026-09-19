"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { validateRoutine, type Routine } from "@/lib/routines/model";

function decode(value: Record<string, unknown>): Routine {
  const valid = validateRoutine({
    name: value.name as string,
    type: value.type as Routine["type"],
    enabled: value.enabled as boolean,
    durationMinutes: value.duration_minutes as number,
    recurrence: value.recurrence as Routine["recurrence"],
    timing: value.timing_rule as Routine["timing"],
    weekdays: value.weekdays as number[],
    calendarSyncEnabled: value.calendar_sync_enabled as boolean,
    notificationMinutes: value.notification_minutes as number | null,
  });
  return {
    ...valid,
    id: String(value.id),
    createdAt: String(value.created_at),
    updatedAt: String(value.updated_at),
  };
}

/** Retained hook name for route compatibility; authenticated routines are server authoritative. */
export function useDeviceRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const busy = useRef(false);
  const reload = useCallback(async () => {
    const response = await fetch("/api/account/routines", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load account routines. Please sign in and retry.");
    const data = await response.json();
    if (!Array.isArray(data.routines)) throw new Error("Invalid routines response.");
    return data.routines.map(decode) as Routine[];
  }, []);
  useEffect(() => {
    let active = true;
    reload()
      .then((items) => {
        if (active) setRoutines(items);
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  async function save(next: Routine[]): Promise<boolean> {
    if (busy.current || loading) return false;
    busy.current = true;
    setError("");
    try {
      // Each UI operation changes exactly one instance; never bulk overwrite account state.
      const removed = routines.filter((r) => !next.some((n) => n.id === r.id));
      const changed = next.filter(
        (r) => JSON.stringify(r) !== JSON.stringify(routines.find((old) => old.id === r.id)),
      );
      if (removed.length + changed.length !== 1) throw new Error("Change one routine at a time.");
      const item = removed[0] ?? changed[0]!;
      const existing = routines.some((r) => r.id === item.id);
      const method = removed.length ? "DELETE" : existing ? "PUT" : "POST";
      const response = await fetch(
        `/api/account/routines${existing ? `?id=${encodeURIComponent(item.id)}` : ""}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          ...(method === "DELETE" ? {} : { body: JSON.stringify(item) }),
        },
      );
      if (!response.ok) throw new Error("Routine could not be saved. Please retry.");
      setRoutines(await reload());
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Routine could not be saved.");
      return false;
    } finally {
      busy.current = false;
    }
  }
  return { routines, save, loading, error };
}
