// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { CalendarIntelligence } from "./CalendarIntelligence";
import { buildDailyTimeline, DEFAULT_ANALYSIS } from "@/lib/miqat/analysis";
vi.mock("./PrayerWorkspace", () => ({
  useWorkspace: () => ({
    syncContext: {
      source: {
        kind: "coordinates",
        latitude: 51.5074,
        longitude: -0.1278,
        timeZone: "Europe/London",
        calculationMethod: 3,
      },
      startDate: "2026-12-01",
    },
  }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows explained availability and permits a preview without allowing disabled writes", async () => {
  const prefs = { ...DEFAULT_ANALYSIS, protectionMode: "CREATE_CALENDAR_BLOCK" as const };
  const day = buildDailyTimeline({
    prayers: {
      date: "2026-12-01",
      timeZone: "Europe/London",
      source: "fixture",
      fajr: "2026-12-01T06:16:00Z",
      sunrise: "2026-12-01T07:43:00Z",
      dhuhr: "2026-12-01T11:54:00Z",
      asr: "2026-12-01T13:37:00Z",
      maghrib: "2026-12-01T15:57:00Z",
      isha: "2026-12-01T17:12:00Z",
    },
    nextFajr: "2026-12-02T06:17:00Z",
    events: [],
    preferences: prefs,
    calendarStatus: "complete",
  });
  const fetchMock = vi.fn(async (url: RequestInfo | URL) =>
    Response.json(
      String(url).endsWith("calendars")
        ? {
            calendars: [{ id: "work", title: "Work", isWritable: true, isPrimary: true }],
            selected: ["work"],
            managementEnabled: false,
            writesEnabled: false,
          }
        : String(url).endsWith("preferences")
          ? prefs
          : String(url).endsWith("timeline")
            ? day
            : {
                proposal: {
                  operation: "create",
                  prayer: "dhuhr",
                  start: "2026-12-01T11:54:00Z",
                  end: "2026-12-01T12:14:00Z",
                  reasons: ["No overlap"],
                },
                token: "signed",
                writesEnabled: false,
              },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<CalendarIntelligence />);
  expect(await screen.findByLabelText("Work")).toBeChecked();
  expect(await screen.findByText("Calendar coverage: complete")).toBeInTheDocument();
  expect(screen.getAllByText("Why this recommendation?")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "Preview protected dhuhr block" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Confirm create" })).toBeDisabled(),
  );
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("action=confirm"))).toBe(false);
});
it("handles a malformed connection response without crashing the calendar page", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ unexpected: true })),
  );
  render(<CalendarIntelligence />);
  expect(
    await screen.findByText("Calendar connection unavailable. Reconnect or refresh."),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Connect Google Calendar (read access)" }),
  ).toHaveAttribute("href", "/api/google-calendar/connect");
});
