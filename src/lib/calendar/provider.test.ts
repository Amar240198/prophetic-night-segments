import { describe, expect, it } from "vitest";
import type { CalendarExportProvider, CalendarProviderAdapter } from "./provider";

describe("calendar provider boundary", () => {
  it("keeps Apple/ICS export separate from remotely owned providers", () => {
    const apple: CalendarExportProvider = {
      target: "apple",
      export: async () => "BEGIN:VCALENDAR",
    };
    const outlook: CalendarProviderAdapter = {
      provider: "microsoft",
      listCalendars: async () => [],
      createEvent: async () => {
        throw new Error("not configured");
      },
      updateEvent: async () => {
        throw new Error("not configured");
      },
      deleteEvent: async () => {
        throw new Error("not configured");
      },
      verifyOwnership: () => false,
    };
    expect(apple.target).toBe("apple");
    expect(outlook.provider).toBe("microsoft");
    const clientTargets: CalendarExportProvider["target"][] = [
      "apple",
      "fantastical",
      "notion",
      "ics",
    ];
    expect(clientTargets).toHaveLength(4);
  });
});
