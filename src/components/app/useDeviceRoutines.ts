"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Routine } from "@/lib/routines/model";
const key = "miqat.routines.v1";
function snapshot() {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("miqat-routines", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("miqat-routines", callback);
  };
}
export function useDeviceRoutines() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const routines = useMemo<Routine[]>(() => {
    try {
      const value = JSON.parse(raw ?? "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }, [raw]);
  function save(next: Routine[]) {
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event("miqat-routines"));
  }
  return { routines, save };
}
