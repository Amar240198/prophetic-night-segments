// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { AppShell } from "@/components/app/AppShell";
import { PrayerWorkspace } from "@/components/app/PrayerWorkspace";
import { SixthPage, PrayersPage } from "@/components/app/PrayerPages";
import { TodayPage } from "@/components/app/TodayPage";
import { CalendarPage } from "@/components/app/CalendarPage";
import { AccountPage } from "@/components/app/AccountPage";
import { FastingCard } from "@/components/FastingCard";
import { RoutinesCard } from "@/components/RoutinesCard";
const navigation = vi.hoisted(() => ({ path: "/app", push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams("next=/app/calendar"),
}));
function workspace(content: React.ReactNode) {
  return render(<PrayerWorkspace>{content}</PrayerWorkspace>);
}
beforeEach(() => {
  localStorage.clear();
  navigation.path = "/app";
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ configured: true, connected: false }) }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Miqāt information architecture", () => {
  it("shares saved fasting programmes with Today", async () => {
    workspace(
      <>
        <FastingCard date="2026-09-18" />
        <TodayPage />
      </>,
    );
    fireEvent.click(screen.getByLabelText("Monday"));
    expect(screen.getByText("Active programmes: Thursday.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("miqat.fasting.v1")!).selected).toEqual(["thursday"]);
    await screen.findByText("Google Calendar: Disconnected");
  });
  it("keeps the public landing focused and exposes an anonymous calculator", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Islamic time, organised around your life.",
    );
    expect(screen.getByRole("link", { name: "Open Sixth calculator" })).toHaveAttribute(
      "href",
      "/sixth",
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
  it("marks the current route in desktop and mobile navigation", () => {
    navigation.path = "/app/prayers";
    render(
      <AppShell>
        <p>Page content</p>
      </AppShell>,
    );
    for (const name of ["Desktop navigation", "Mobile navigation"]) {
      const nav = within(screen.getByRole("navigation", { name }));
      expect(
        nav.getByRole("link", { name: name.startsWith("Desktop") ? "All Prayers" : "Prayer" }),
      ).toHaveAttribute("aria-current", "page");
    }
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
  });
  it("opens More and closes it after navigation and Escape", () => {
    render(
      <AppShell>
        <p>Page</p>
      </AppShell>,
    );
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    screen
      .getByRole("navigation", { name: "More navigation" })
      .addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "More navigation" })).getByRole("link", {
        name: "Fasting",
      }),
    );
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    fireEvent.keyDown(screen.getByRole("navigation", { name: "More navigation" }), {
      key: "Escape",
    });
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute("aria-expanded", "false");
  });
  it("shows summaries on Today without module configuration", async () => {
    workspace(<TodayPage />);
    for (const name of ["Next prayer", "Prayers today", "Night", "Fasting", "Routines", "Calendar"])
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Prayer-time source")).not.toBeInTheDocument();
    expect(await screen.findByText("Google Calendar: Disconnected")).toBeInTheDocument();
  });
  it("keeps Sixth isolated from fasting and routines", () => {
    workspace(<SixthPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Sixth of the Night" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Prayer-time source")).toBeInTheDocument();
    expect(screen.queryByText("Fasting schedules")).not.toBeInTheDocument();
    expect(screen.queryByText("Personal routines")).not.toBeInTheDocument();
  });
  it("loads All Prayers without a night timeline", async () => {
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        ({
          ok: true,
          json: async () =>
            String(url).startsWith("/api/prayer-times")
              ? {
                  maghrib: "2026-09-18T18:10:00Z",
                  fajr: "2026-09-19T04:30:00Z",
                  timeZone: "Europe/London",
                  location: "London",
                  source: "London Unified",
                  dailyPrayerTimes: {
                    serviceDate: "2026-09-18",
                    fajr: "05:30",
                    sunrise: "06:40",
                    dhuhr: "12:50",
                    asr: "16:00",
                    maghrib: "19:10",
                    isha: "20:30",
                  },
                }
              : { connected: false, configured: true },
        }) as Response,
    );
    workspace(<PrayersPage />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));
    expect(await screen.findByText("Today’s prayer timetable")).toBeInTheDocument();
    expect(screen.getByText("informational")).toBeInTheDocument();
    expect(screen.queryByText("Conventional Night Division")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download selected (.ics)" })).toBeInTheDocument();
  });
  it("preserves fasting programme controls and dated Dāwūd settings", () => {
    render(<FastingCard date="2026-09-18" />);
    fireEvent.click(screen.getByLabelText("Dāwūd"));
    expect(screen.getByLabelText("Dāwūd starting date")).toHaveValue("2026-09-18");
    expect(screen.getByRole("button", { name: "Download schedule (.ics)" })).toBeInTheDocument();
  });
  it("supports adding, editing, disabling and deleting a routine", () => {
    render(<RoutinesCard />);
    expect(screen.queryByLabelText("Routine name")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "+ Add routine" }));
    fireEvent.change(screen.getByLabelText("Routine name"), { target: { value: "Reading" } });
    fireEvent.click(screen.getByRole("button", { name: "Save routine" }));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save routine" }));
    expect(screen.getByText(/Reading · quran · 30 minutes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    expect(screen.getByRole("button", { name: "Enable" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByText(/Reading ·/)).not.toBeInTheDocument();
  });
  it("shows central calendar controls without unsupported sync toggles", async () => {
    workspace(<CalendarPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(screen.getByLabelText("All Prayers")).toBeChecked();
    expect(screen.getByLabelText("Sixth")).toBeChecked();
    expect(await screen.findByRole("button", { name: "Connect Google Calendar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Delete all/ })).not.toBeInTheDocument();
  });
  it("uses existing authentication and returns to the requested app route", async () => {
    workspace(<AccountPage user={null} />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/app/calendar"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/signin",
      expect.objectContaining({ method: "POST" }),
    );
  });
  it("shows the actual account plan and data export", async () => {
    workspace(<AccountPage user={{ id: "id", email: "user@example.com", plan: "FREE" }} />);
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("FREE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export my data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await screen.findByText("Google Calendar: Disconnected");
  });
});
