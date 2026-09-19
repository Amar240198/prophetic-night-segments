// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import { CalendarCard } from "./CalendarCard";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ configured: false, connected: false }) }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const result = calculateNightSegments({
  maghrib: "2026-01-01T18:00:00Z",
  fajr: "2026-01-02T06:00:00Z",
  timeZone: "UTC",
});

it("uses the selected night-map buffer and disables empty exports", () => {
  render(<CalendarCard result={result} dawudSelected={false} prayerSource="Manual" />);
  expect(screen.getByLabelText(/Qiyam \/ Tahajjud — Wake Up/)).toBeChecked();
  expect(screen.getAllByText(/02:00:00/).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText("Wake-up buffer")).not.toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox"))
    if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
  expect(screen.queryByRole("button", { name: /Download Calendar/ })).not.toBeInTheDocument();
});

it("uses the selected night-map buffer for generated events", () => {
  render(
    <CalendarCard
      result={result}
      dawudSelected={false}
      prayerSource="Manual"
      wakeBufferMinutes={30}
    />,
  );
  expect(screen.getByText(/01:30:00/)).toBeInTheDocument();
});

it("updates the Dawud window without exposing an ICS download action", () => {
  const { rerender } = render(
    <CalendarCard result={result} dawudSelected={true} prayerSource="Manual" />,
  );
  expect(screen.getByLabelText(/Go Back to Sleep/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Download Calendar/ })).not.toBeInTheDocument();
  rerender(<CalendarCard result={result} dawudSelected={false} prayerSource="Manual" />);
  expect(screen.queryByLabelText(/Go Back to Sleep/)).not.toBeInTheDocument();
});

it("offers all six night duration checkboxes in boundary order", () => {
  render(<CalendarCard result={result} dawudSelected={false} prayerSource="Manual" />);
  for (let part = 1; part <= 6; part++) {
    const checkbox = screen.getByRole("checkbox", { name: new RegExp(`Night — Part ${part}`) });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(checkbox.closest("label")).toHaveTextContent(/ – /);
  }
  expect(screen.getByRole("checkbox", { name: /Final Sixth/ })).toBeInTheDocument();
});
