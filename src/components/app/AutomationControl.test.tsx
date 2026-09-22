// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AutomationControl } from "./AutomationControl";
import { DEFAULT_AUTOMATION } from "@/lib/automation/config";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("saves account settings before preview and requires preview before enabling", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetcher = vi.fn(async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body });
    if (String(url).includes("google-calendar"))
      return Response.json({
        events: [
          {
            id: "routine-one",
            serviceDate: "2026-09-19",
            title: "Evening Adhkar",
            start: "2026-09-19T15:20:00Z",
            end: "2026-09-19T15:35:00Z",
            timeZone: "Europe/London",
            description: "15 minutes after asr",
          },
        ],
        issues: [],
      });
    return Response.json({
      config: DEFAULT_AUTOMATION,
      state: { revision: 1 },
      entitlement: { allowed: false, status: "expired" },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<AutomationControl />);
  expect(
    screen.getByRole("button", { name: "Enable automation / start 7-day trial" }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Preview Tomorrow" })).toBeEnabled(),
  );
  fireEvent.change(screen.getByLabelText("Friday Jumu’ah time"), { target: { value: "13:30" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview Tomorrow" }));
  expect(await screen.findByText(/Evening Adhkar/)).toBeInTheDocument();
  expect(calls[1]?.body?.config).toMatchObject({ personalAnchors: { jumuah: "13:30" } });
  expect(calls[2]?.body).toMatchObject({ action: "preview", tomorrow: true });
  expect(
    screen.getByRole("button", { name: "Enable automation / start 7-day trial" }),
  ).toBeEnabled();
});
it("does not enable actions if account configuration cannot load", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  render(<AutomationControl />);
  expect(await screen.findByText("Sign in to load automation settings.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview Today" })).toBeDisabled();
});

it("shows paused timetable migration and editable live-provider settings", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        config: DEFAULT_AUTOMATION,
        state: { revision: 2, enabled: false, last_error_code: "PRAYER_SOURCE_REMOVED" },
        entitlement: {},
      }),
    ),
  );
  render(<AutomationControl />);
  expect(await screen.findByText(/The London Unified timetable was removed/)).toBeInTheDocument();
  expect(screen.getByLabelText("Prayer provider")).toHaveValue("aladhan");
  expect(screen.getByLabelText("City")).toHaveValue("London");
  expect(screen.queryByRole("option", { name: /London Unified/ })).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Enable automation / start 7-day trial" }),
  ).toBeDisabled();
});
