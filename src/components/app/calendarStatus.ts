"use client";
import { useSyncExternalStore } from "react";
const key = "miqat.last-sync.v1";
export function recordCalendarSync(summary: string) {
  try {
    sessionStorage.setItem(key, `${new Date().toLocaleString()} · ${summary}`);
    window.dispatchEvent(new Event("miqat-calendar-sync"));
  } catch {
    /* The operation succeeds even when browser storage is unavailable. */
  }
}
function snapshot() {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener("miqat-calendar-sync", callback);
  return () => window.removeEventListener("miqat-calendar-sync", callback);
}
export function useCalendarSyncStatus() {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
