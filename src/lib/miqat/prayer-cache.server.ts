import type { SyncSource } from "@/lib/google-calendar/sync";
import { loadSyncNight } from "@/lib/google-calendar/sync-plan.server";
// Bounded, short-lived prayer cache only. No calendar events or credentials enter this cache.
const prayers = new Map<string, { expiresAt: number; value: ReturnType<typeof loadSyncNight> }>();
export function cachedPrayerNight(source: SyncSource, date: string) {
  const key = JSON.stringify([source, date]);
  const now = Date.now();
  const cached = prayers.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (prayers.size >= 128) prayers.delete(prayers.keys().next().value!);
  const value = loadSyncNight(source, date).catch((error) => {
    prayers.delete(key);
    throw error;
  });
  prayers.set(key, { expiresAt: now + 300000, value });
  return value;
}
