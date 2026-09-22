// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import { DEFAULT_PRAYER } from "@/lib/product/settings";
import { DEFAULT_AUTOMATION } from "@/lib/automation/config";
import { DEFAULT_ANALYSIS } from "@/lib/miqat/analysis";
import { featureEntitlements } from "@/lib/product/entitlements";
const navigation = vi.hoisted(() => ({ path: "/app", push: vi.fn(), refresh: vi.fn() }));
const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.path,
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/product/ProductContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/product/ProductContext")>()),
  useProduct: () => context.value,
}));
import Home from "@/app/page";
import { AppShell } from "@/components/app/AppShell";
import { TodayPage } from "@/components/app/TodayPage";
import { CalendarPage } from "@/components/app/CalendarPage";
import { AccountPage } from "@/components/product/AccountPage";
import { Onboarding } from "@/components/product/Onboarding";
import { AutomationEditor } from "@/components/product/AutomationsPage";
import { RoutinesCard } from "@/components/RoutinesCard";
import { AuthForm } from "@/components/product/AuthForm";
import { SettingsPage } from "@/components/product/SettingsPage";
import { PrayerSettings } from "@/components/product/PrayerSettings";
const day = {
  date: "2026-09-18",
  timezone: "Europe/London",
  source: DEFAULT_PRAYER.source,
  schedule: {
    source: "AlAdhan",
    timeZone: "Europe/London",
    serviceDate: "2026-09-18",
    fajr: "2026-09-18T04:30:00Z",
    sunrise: "2026-09-18T05:40:00Z",
    dhuhr: "2026-09-18T11:50:00Z",
    asr: "2026-09-18T15:00:00Z",
    maghrib: "2026-09-18T18:10:00Z",
    isha: "2026-09-18T19:30:00Z",
  },
  night: calculateNightSegments({
    maghrib: "2026-09-18T18:10:00Z",
    fajr: "2026-09-19T04:30:00Z",
    timeZone: "Europe/London",
  }),
  fasting: [{ date: "2026-09-18", kind: "dawud" }],
};
function state(plan: "FREE" | "PRO" = "FREE", onboarding = "complete") {
  return {
    user: { id: "user", email: "user@example.com" },
    settings: {
      prayer: DEFAULT_PRAYER,
      configured: true,
      revision: 1,
      onboarding,
      automation: DEFAULT_AUTOMATION,
      analysis: DEFAULT_ANALYSIS,
    },
    entitlements: {
      plan,
      features: featureEntitlements({ plan, active: true }),
      subscription: {
        status: "active",
        customer: plan === "PRO",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
    },
  };
}
beforeEach(() => {
  localStorage.clear();
  navigation.path = "/app";
  context.value = {
    state: state(),
    day,
    error: "",
    dayError: "",
    save: vi.fn(),
    refresh: vi.fn(),
    reloadDay: vi.fn(),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ configured: true, connected: false })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps acquired coordinates unsaved until explicitly confirmed", async () => {
  const save = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (success: (p: unknown) => void) =>
        success({ coords: { latitude: 51.5007292, longitude: -0.1246254 } }),
    },
  });
  render(<PrayerSettings initial={DEFAULT_PRAYER} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: /precise location/i }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Latitude")).toHaveValue(51.5007292);
  fireEvent.click(screen.getByRole("button", { name: "Save prayer settings" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          kind: "coordinates",
          latitude: 51.5007292,
          longitude: -0.1246254,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      }),
    ),
  );
});
it("offers legacy source review and connection removal without exposing automation editors in Settings", async () => {
  const current = state();
  context.value.state = {
    ...current,
    settings: { ...current.settings, configured: false, sourceReviewRequired: true },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ connected: true, email: "user@example.com" })),
  );
  render(<SettingsPage />);
  expect(screen.getByText(/Your previous timetable is no longer supported/)).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Disconnect Google Calendar" })).toBeEnabled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByText("Protection mode")).not.toBeInTheDocument();
});
it("clears previously loaded calendar events when a refresh discovers disconnection", async () => {
  context.value.state = state("PRO");
  let connected = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith("/session")
          ? { connected }
          : url.endsWith("/calendars")
            ? { selected: ["primary"], calendars: [] }
            : {
                calendarStatus: "complete",
                events: [
                  {
                    id: "event",
                    title: "Existing meeting",
                    start: day.schedule.dhuhr,
                    end: day.schedule.asr,
                    metadata: {},
                  },
                ],
                analyses: [],
              },
      ),
    ),
  );
  render(<CalendarPage />);
  expect(await screen.findByText("Existing meeting")).toBeInTheDocument();
  connected = false;
  fireEvent.click(screen.getByRole("button", { name: "Refresh schedule" }));
  expect(await screen.findByRole("link", { name: "Connect Google Calendar" })).toBeInTheDocument();
  expect(screen.queryByText("Existing meeting")).not.toBeInTheDocument();
});
it("presents one product and the separately available free calculator", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Your calendar, automatically aligned with Salah.",
  );
  expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/sign-up");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("has exactly five primary destinations on desktop and mobile", () => {
  navigation.path = "/app/settings";
  render(
    <AppShell>
      <p>Page</p>
    </AppShell>,
  );
  for (const name of ["Desktop navigation", "Mobile navigation"]) {
    const links = within(screen.getByRole("navigation", { name })).getAllByRole("link");
    expect(links.map((x) => x.textContent)).toEqual([
      "Today",
      "Calendar",
      "Automations",
      "Settings",
      "Account",
    ]);
    expect(links[3]).toHaveAttribute("aria-current", "page");
  }
});
it("shows prayer times, Qiyām and fasting without editing controls", () => {
  render(<TodayPage />);
  expect(screen.getByText("05:30")).toBeInTheDocument();
  expect(screen.getByText("Midpoint")).toBeInTheDocument();
  expect(screen.getByText("Last third")).toBeInTheDocument();
  expect(screen.getByText(/Fasting today/)).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps prayer and night data visible during a calendar disconnection", async () => {
  context.value.state = state("PRO");
  render(<TodayPage />);
  expect(await screen.findByText(/Connect your calendar to see Salah/)).toBeInTheDocument();
  expect(screen.getByText("05:30")).toBeInTheDocument();
});
it("offers a reusable upgrade experience to Free calendar users without reading Google", () => {
  render(<CalendarPage />);
  expect(screen.getByRole("link", { name: /Explore Miqāt Pro/ })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("resumes persisted onboarding and continues Free without calendar consent", async () => {
  context.value.state = state("FREE", "plan");
  render(<Onboarding />);
  fireEvent.click(screen.getByRole("button", { name: "Continue Free" }));
  await waitFor(() => expect(context.value.save).toHaveBeenCalledWith({ advance: true }));
  expect(screen.queryByText("Choose calendars")).not.toBeInTheDocument();
});
it("edits automation in one form without exposing sync horizons", async () => {
  const save = vi.fn(async () => {});
  render(
    <AutomationEditor initial={DEFAULT_AUTOMATION} analysis={DEFAULT_ANALYSIS} onSave={save} />,
  );
  fireEvent.click(screen.getByLabelText("Mondays"));
  fireEvent.change(screen.getByLabelText("Preferred window"), { target: { value: "final-sixth" } });
  fireEvent.click(screen.getByRole("button", { name: "Save automation preferences" }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ horizon: 30, qiyamWindow: "final-sixth" }),
      DEFAULT_ANALYSIS,
    ),
  );
  expect(screen.queryByText("Continuous")).not.toBeInTheDocument();
});
it("shows account identity and billing without connection or automation controls", () => {
  render(<AccountPage />);
  expect(screen.getByText("user@example.com")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Upgrade to Miqāt Pro/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
it("does not display a false email-sent message when reset delivery is unavailable", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json(
      { error: { message: "Password reset email is not configured." } },
      { status: 503 },
    ),
  );
  render(<AuthForm mode="signin" />);
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Request password reset" }));
  expect(await screen.findByText("Password reset email is not configured.")).toBeInTheDocument();
});
it("supports adding, editing, disabling and deleting an account routine", async () => {
  let rows: Record<string, unknown>[] = [];
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    if (options?.method === "DELETE") rows = [];
    else if (options?.method === "POST" || options?.method === "PUT") {
      const value = JSON.parse(String(options.body));
      rows = [
        {
          ...value,
          id: "11111111-1111-4111-8111-111111111111",
          duration_minutes: value.durationMinutes,
          timing_rule: value.timing,
          created_at: "2026-09-19",
          updated_at: "2026-09-19",
        },
      ];
    }
    return Response.json({ routines: rows, routine: rows[0] });
  });
  render(<RoutinesCard />);
  expect(screen.queryByLabelText("Routine name")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByText("Loading account routines…")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "+ Add Custom Routine" }));
  fireEvent.change(screen.getByLabelText("Routine name"), { target: { value: "Reading" } });
  fireEvent.click(screen.getByRole("button", { name: "Save routine" }));
  await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save routine" }));
  expect(await screen.findByText(/Reading · quran · 30 minutes/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
  expect(await screen.findByRole("button", { name: "Enable" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByText(/Reading ·/)).not.toBeInTheDocument());
});
