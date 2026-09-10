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

it("recovers through the session endpoint after popup closure without a completion message", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(json({ connected: false, configured: true }));
  vi.stubGlobal("fetch", fetchMock);
  const popup = { closed: false, close: vi.fn() };
  vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
  render(<GoogleCalendarSection events={events} valid />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
  expect(screen.getByRole("button", { name: "Waiting for Google…" })).toBeDisabled();
  popup.closed = true;
  fetchMock.mockResolvedValue(
    json({ connected: true, configured: true, email: "user@example.com" }),
  );
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  expect(screen.getByText("Google Calendar connected")).toBeInTheDocument();
  expect(screen.queryByText("Waiting for Google…")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/google-calendar/session",
    expect.objectContaining({ cache: "no-store" }),
  );
});

it("keeps polling after a success message until the server confirms connection", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(json({ connected: false, configured: true }));
  vi.stubGlobal("fetch", fetchMock);
  const popup = { closed: false, close: vi.fn() } as unknown as Window;
  vi.spyOn(window, "open").mockReturnValue(popup);
  render(<GoogleCalendarSection events={events} valid />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
  await act(async () => {
    fireEvent(
      window,
      new MessageEvent("message", {
        origin: window.location.origin,
        source: popup,
        data: { type: "pns-google-calendar", status: "connected" },
      }),
    );
  });
  expect(screen.getByText("Waiting for Google…")).toBeInTheDocument();
  fetchMock.mockResolvedValue(json({ connected: true, configured: true }));
  await act(async () => {
    vi.advanceTimersByTime(2500);
  });
  expect(screen.getByText("Google Calendar connected")).toBeInTheDocument();
});

it("ends waiting with a useful error if the closed popup never establishes a session", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ connected: false, configured: true })));
  vi.spyOn(window, "open").mockReturnValue({ closed: true } as Window);
  render(<GoogleCalendarSection events={events} valid />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  await act(async () => {
    vi.advanceTimersByTime(15_000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("connection could not be confirmed");
  expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeEnabled();
});

it("submits one explicit 30-night action with only selected types and reports partial results", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(json({ connected: true, configured: true }));
  vi.stubGlobal("fetch", fetchMock);
  const syncContext = { startDate: "2026-03-20", source: { kind: "london-unified" as const } };
  const syncOptions = {
    wakeBufferMinutes: 15,
    dawudSelected: false,
    fajrPreparationMinutes: 20,
    firstAdhanMinutes: null,
  };
  render(
    <GoogleCalendarSection
      events={events}
      valid
      syncContext={syncContext}
      syncOptions={syncOptions}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Add Qiyam Plan to Calendar" }));
  fireEvent.click(screen.getByLabelText(/Fajr/));
  let finish!: (body: ReturnType<typeof json>) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Sync 30 nights to Google Calendar" }));
  expect(screen.getByRole("button", { name: "Adding 30 nights…" })).toBeDisabled();
  expect(fetchMock.mock.calls[1][0]).toBe("/api/google-calendar/sync");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    ...syncContext,
    options: syncOptions,
    nights: 30,
    mode: "fixed",
    selected: ["fajr"],
  });
  await act(async () => {
    finish(
      json({
        nights: 30,
        syncedNights: 29,
        outcomes: Array.from({ length: 30 }, (_, i) => ({
          date: `night-${i}`,
          id: "fajr",
          status: i === 2 ? "failed" : "created",
          ...(i === 2 ? { code: "EVENT_FAILED" } : {}),
        })),
      }),
    );
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Some events were not synced");
  expect(
    screen.getByText("29 of 30 nights fully synced. 1 events failed or were not attempted."),
  ).toBeInTheDocument();
  expect(screen.queryByText("30 nights synced to Google Calendar")).not.toBeInTheDocument();
});

it("recovers on focus after browser isolation made the popup look closed early", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(json({ connected: false, configured: true }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "open").mockReturnValue({ closed: true } as Window);
  render(<GoogleCalendarSection events={events} valid />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
  await act(async () => {
    vi.advanceTimersByTime(15_000);
  });
  expect(screen.getByRole("alert")).toBeInTheDocument();
  fetchMock.mockResolvedValue(json({ connected: true, configured: true }));
  await act(async () => {
    fireEvent.focus(window);
  });
  expect(screen.getByText("Google Calendar connected")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("rejects same-origin completion messages from a different window", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json({ connected: false, configured: true }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(window, "open").mockReturnValue({ closed: false } as Window);
  render(<GoogleCalendarSection events={events} valid />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Connect Google Calendar" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Connect Google Calendar" }));
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: window.location.origin,
      source: {} as Window,
      data: { type: "pns-google-calendar", status: "connected" },
    }),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(screen.getByText("Waiting for Google…")).toBeInTheDocument();
});

it.each([
  ["60 days", "fixed", 60],
  ["90 days", "fixed", 90],
  ["Continuous", "continuous", 90],
] as const)(
  "offers bounded %s selection and submits the correct horizon",
  async (label, mode, nights) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ connected: true, configured: true }))
      .mockResolvedValueOnce(json({ error: { code: "RATE_LIMITED" } }, false));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GoogleCalendarSection
        events={events}
        valid
        syncContext={{ startDate: "2026-03-01", source: { kind: "london-unified" } }}
        syncOptions={{
          wakeBufferMinutes: 15,
          dawudSelected: false,
          fajrPreparationMinutes: 20,
          firstAdhanMinutes: null,
        }}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Add Qiyam Plan to Calendar" }));
    expect(screen.getByRole("group", { name: "Sync calendar for:" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "30 days" })).toBeChecked();
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: label }));
    if (mode === "continuous")
      expect(screen.getByRole("note")).toHaveTextContent("Automatic renewal is not enabled yet");
    fireEvent.click(screen.getByLabelText(/Fajr/));
    fireEvent.click(
      screen.getByRole("button", { name: `Sync ${nights} nights to Google Calendar` }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      mode,
      nights,
      selected: ["fajr"],
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Google Calendar is busy");
  },
);

it("restores Continuous from the session without confusing it with fixed 90 days", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      json({
        connected: true,
        configured: true,
        syncPreference: { mode: "continuous", horizonDays: 90 },
      }),
    ),
  );
  render(
    <GoogleCalendarSection
      events={events}
      valid
      syncContext={{ startDate: "2026-03-01", source: { kind: "london-unified" } }}
      syncOptions={{
        wakeBufferMinutes: 15,
        dawudSelected: false,
        fajrPreparationMinutes: 20,
        firstAdhanMinutes: null,
      }}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Add Qiyam Plan to Calendar" }));
  expect(screen.getByRole("radio", { name: "Continuous" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "90 days" })).not.toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "30 days" }));
  await act(async () => {
    fireEvent.focus(window);
  });
  expect(screen.getByRole("radio", { name: "30 days" })).toBeChecked();
});
