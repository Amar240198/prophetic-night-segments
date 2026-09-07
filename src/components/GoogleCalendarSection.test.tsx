// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GoogleCalendarSection } from "./GoogleCalendarSection";
import { GoogleCalendarCompletion } from "./GoogleCalendarCompletion";

const events = [
  {
    id: "last-third",
    title: "Qiyam — Last Third Begins",
    start: "2026-01-02T02:00:00Z",
    end: "2026-01-02T02:00:00Z",
    timeZone: "UTC",
    description: "Planning aid",
  },
  {
    id: "fajr",
    title: "Fajr",
    start: "2026-01-02T06:00:00Z",
    end: "2026-01-02T06:00:00Z",
    timeZone: "UTC",
    description: "Planning aid",
  },
];
const json = (body: unknown, ok = true) => ({ ok, json: async () => body });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shows the disconnected state and handles blocked OAuth popups", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ connected: false, configured: true })));
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(<GoogleCalendarSection events={events} valid />);
  const connect = screen.getByRole("button", { name: "Connect Google Calendar" });
  await waitFor(() => expect(connect).toBeEnabled());
  fireEvent.click(connect);
  expect(open).toHaveBeenCalledWith(
    "/api/google-calendar/connect",
    "pns-google-calendar",
    expect.any(String),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Allow popups");
});

it("accepts only a same-origin completion from its OAuth popup", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json({ connected: false, configured: true }));
  vi.stubGlobal("fetch", fetchMock);
  const popup = { close: vi.fn() } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  render(<GoogleCalendarSection events={events} valid />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: "https://attacker.example",
      source: popup,
      data: { type: "pns-google-calendar", status: "connected" },
    }),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: window.location.origin,
      source: popup,
      data: { type: "pns-google-calendar", status: "PERMISSION_DENIED" },
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Calendar permission was not granted.");
});

it("requires explicit selection, submits only chosen events, and disconnects", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json({ connected: true, configured: true, email: "user@example.com" }))
    .mockResolvedValueOnce(json({ outcomes: [{ id: "fajr", status: "created" }] }))
    .mockResolvedValueOnce(json({ connected: false, revoked: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<GoogleCalendarSection events={events} valid />);
  expect(await screen.findByText("Connected as: user@example.com")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add Qiyam Plan to Calendar" }));
  expect(screen.getByRole("button", { name: "Add selected events (0)" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/Fajr/));
  fireEvent.click(screen.getByRole("button", { name: "Add selected events (1)" }));
  expect(await screen.findByText(/Fajr: Added/)).toBeInTheDocument();
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body).events).toEqual([events[1]]);
  fireEvent.click(screen.getByRole("button", { name: "Disconnect Google Calendar" }));
  expect(await screen.findByText(/Google Calendar disconnected/)).toBeInTheDocument();
});

it("reports partial failures and preserves successful outcomes", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ connected: true, configured: true, email: "user@example.com" }))
      .mockResolvedValueOnce(
        json({
          outcomes: [
            { id: "last-third", status: "existing" },
            { id: "fajr", status: "failed", code: "EVENT_FAILED" },
          ],
        }),
      ),
  );
  render(<GoogleCalendarSection events={events} valid />);
  fireEvent.click(await screen.findByRole("button", { name: "Add Qiyam Plan to Calendar" }));
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Add selected events (2)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Some events could not be added");
  expect(screen.getByText(/Last Third Begins: Already added/)).toBeInTheDocument();
  expect(screen.getByText(/Fajr: Unable to create calendar event/)).toBeInTheDocument();
});

it("requires reconnecting when Google rejects an expired token", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(json({ connected: true, configured: true, email: "user@example.com" }))
      .mockResolvedValueOnce(json({ error: { code: "SESSION_EXPIRED" } }, false)),
  );
  render(<GoogleCalendarSection events={events} valid />);
  fireEvent.click(await screen.findByRole("button", { name: "Add Qiyam Plan to Calendar" }));
  fireEvent.click(screen.getByLabelText(/Fajr/));
  fireEvent.click(screen.getByRole("button", { name: "Add selected events (1)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("session has expired");
  expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeEnabled();
});

it("expires the connected display when the session reaches its expiry", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      json({
        connected: true,
        configured: true,
        email: "user@example.com",
        expiresAt: Date.now() + 12_000,
      }),
    ),
  );
  render(<GoogleCalendarSection events={events} valid />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText("Connected as: user@example.com")).toBeInTheDocument();
  await act(async () => {
    vi.advanceTimersByTime(2001);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("session has expired");
});

it("shows setup unavailability without enabling OAuth", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ connected: false, configured: false })));
  render(<GoogleCalendarSection events={events} valid />);
  expect(await screen.findByText(/not configured yet/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeDisabled();
});

it("renders a safe completion message for unknown callback status", () => {
  render(<GoogleCalendarCompletion status="untrusted private details" />);
  expect(screen.getByRole("status")).toHaveTextContent("Google Calendar connection failed.");
  expect(screen.queryByText("untrusted private details")).not.toBeInTheDocument();
});
