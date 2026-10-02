// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/app/useDeviceRoutines", () => ({
  useDeviceRoutines: () => ({
    routines: [
      {
        id: "r",
        name: "Settings",
        type: "qaylula",
        enabled: true,
        durationMinutes: 20,
        recurrence: "daily",
        timing: { kind: "relative", anchor: "dhuhr", offsetMinutes: 15 },
      },
    ],
    save: vi.fn(),
    loading: false,
    error: "",
  }),
}));
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import { CalendarSettings } from "@/components/product/CalendarSettings";
import { RoutinesCard } from "@/components/RoutinesCard";
import { AllPrayersCard } from "@/components/AllPrayersCard";
vi.mock("@/components/GoogleCalendarSection", () => ({ GoogleCalendarSection: () => null }));
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps custom routine names raw while localizing their explicit type/rule labels", () => {
  render(
    <LocaleProvider initialLocale="ar">
      <RoutinesCard />
    </LocaleProvider>,
  );
  const name = screen.getByText(/Settings ·/);
  expect(name).toHaveTextContent("Settings · القيلولة");
  expect(name).toHaveTextContent("بعد الظهر بـ 15 دقيقة");
});
it("does not translate API calendar names or account email addresses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.includes("session")
          ? { connected: true, email: "settings@example.com" }
          : {
              calendars: [{ id: "c", title: "Qaylula", isWritable: true, isPrimary: true }],
              selected: ["c"],
              destination: "c",
              managementEnabled: false,
              writesEnabled: false,
            },
      ),
    ),
  );
  render(
    <LocaleProvider initialLocale="ar">
      <CalendarSettings />
    </LocaleProvider>,
  );
  await screen.findByText("settings@example.com");
  expect(screen.getByRole("checkbox")).toHaveAccessibleName("Qaylula (الأساسي)");
  expect(screen.getByRole("option", { name: "Qaylula" })).toHaveValue("c");
});
it("keeps provider names, dates and timestamps raw while translating prayer labels", async () => {
  const schedule = {
    date: "2026-10-02",
    timeZone: "UTC",
    source: "Settings",
    fajr: "05:00",
    sunrise: "06:00",
    dhuhr: "13:00",
    asr: "16:00",
    maghrib: "18:00",
    isha: "20:00",
  };
  render(
    <LocaleProvider initialLocale="ar">
      <AllPrayersCard schedule={schedule} />
    </LocaleProvider>,
  );
  const card = screen.getByRole("heading", { name: "جدول الصلاة لليوم" }).closest("section")!;
  expect(card).toHaveTextContent("2026-10-02 · Settings");
  expect(within(card).getByText("06:00")).toBeInTheDocument();
  await waitFor(() => expect(within(card).getAllByText("الظهر").length).toBeGreaterThan(0));
});
