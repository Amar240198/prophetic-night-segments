import type { CalendarEvent } from "./buildCalendarEvents";
import { isServiceDate } from "./ownership";

/** IndexedDB serializes read/write transactions across tabs. No timestamp enters a UID. */
export async function assignExportIdentities(
  events: readonly CalendarEvent[],
): Promise<CalendarEvent[]> {
  if (events.some((event) => !isServiceDate(event.serviceDate)))
    throw new Error("Missing service date");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("sixth-calendar-identities", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("events");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error("Calendar identity storage unavailable"));
    open.onblocked = () => reject(new Error("Calendar identity storage is busy"));
  });
  try {
    return await new Promise<CalendarEvent[]>((resolve, reject) => {
      const transaction = db.transaction("events", "readwrite");
      const store = transaction.objectStore("events");
      const result: CalendarEvent[] = [];
      events.forEach((event, index) => {
        // The event kind is a permanent scheduling slot, never a display label.
        const key = JSON.stringify(["ics-v1", event.serviceDate, event.id]);
        const request = store.get(key);
        request.onsuccess = () => {
          const appEventId = request.result ?? crypto.randomUUID();
          if (typeof appEventId !== "string" || !/^[0-9a-f-]{36}$/.test(appEventId)) {
            transaction.abort();
            return;
          }
          if (!request.result) store.add(appEventId, key);
          result[index] = { ...event, appEventId };
        };
      });
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = transaction.onabort = () =>
        reject(new Error("Unable to persist calendar identity"));
    });
  } finally {
    db.close();
  }
}
