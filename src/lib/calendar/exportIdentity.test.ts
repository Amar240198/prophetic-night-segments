import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignExportIdentities } from "./exportIdentity";
import { generateICS } from "./generateICS";
import type { CalendarEvent } from "./buildCalendarEvents";

const event: CalendarEvent = {
  id: "fajr",
  serviceDate: "2026-03-28",
  title: "Fajr",
  start: "2026-03-29T05:00:00Z",
  end: "2026-03-29T05:00:00Z",
  timeZone: "Europe/London",
  description: "Optional plan",
};
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

describe("persistent ICS export identities", () => {
  it("retains the same UID after label, time and timezone changes", async () => {
    const [first] = await assignExportIdentities([event]);
    const [changed] = await assignExportIdentities([
      {
        ...event,
        title: "New label",
        start: "2026-03-29T06:00:00Z",
        end: "2026-03-29T06:00:00Z",
        timeZone: "America/New_York",
      },
    ]);
    expect(changed!.appEventId).toBe(first!.appEventId);
    const ics = generateICS([changed!], "2026-03-28T12:00:00Z");
    expect(ics).toContain(`UID:${first!.appEventId}@prophetic-night-segments`);
    expect(ics).toContain("X-SIXTH-SERVICE-DATE:2026-03-28");
    expect(ics).toContain("DTSTART:20260329T060000Z");
  });
  it("serializes concurrent exports from different tabs without allocating duplicate identities", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => assignExportIdentities([event])),
    );
    expect(new Set(results.map((result) => result[0]!.appEventId)).size).toBe(1);
  });
  it("gives each service date and event slot a distinct identity", async () => {
    const result = await assignExportIdentities([
      event,
      { ...event, id: "night-part-6" },
      { ...event, serviceDate: "2026-03-29" },
    ]);
    expect(new Set(result.map((item) => item.appEventId)).size).toBe(3);
  });
  it("fails safely when durable storage or original service date is unavailable", async () => {
    await expect(assignExportIdentities([{ ...event, serviceDate: undefined }])).rejects.toThrow(
      "service date",
    );
    expect(() => generateICS([event], "2026-03-28T12:00:00Z")).toThrow("Persist");
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("Storage disabled");
      },
    });
    await expect(assignExportIdentities([event])).rejects.toThrow("Storage disabled");
  });
});
