// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
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

it("updates buffers, validates custom input and disables empty exports", () => {
  render(<CalendarCard result={result} dawudSelected={false} prayerSource="Manual" />);
  expect(screen.getByLabelText(/Qiyam \/ Tahajjud — Wake Up/)).toBeChecked();
  expect(screen.getByText(/01:45:00/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Wake-up buffer"), { target: { value: "custom" } });
  const input = screen.getByLabelText("Custom wake-up buffer (minutes)");
  fireEvent.change(input, { target: { value: "-1" } });
  expect(screen.getByRole("alert")).toHaveTextContent("whole number");
  expect(screen.getByRole("button", { name: /Download Calendar/ })).toBeDisabled();
  fireEvent.change(input, { target: { value: "30" } });
  expect(screen.getByText(/01:30:00/)).toBeInTheDocument();
  for (const checkbox of screen.getAllByRole("checkbox"))
    if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
  expect(screen.getByRole("button", { name: /Download Calendar/ })).toBeDisabled();
});

it("downloads only selected events and updates the Dawud window", async () => {
  const createObjectURL = vi.fn().mockReturnValue("blob:calendar");
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const { rerender } = render(
    <CalendarCard result={result} dawudSelected={true} prayerSource="Manual" />,
  );
  fireEvent.click(screen.getByLabelText(/Go Back to Sleep/));
  fireEvent.click(screen.getByRole("button", { name: /Download Calendar/ }));
  expect(click).toHaveBeenCalledOnce();
  const blob = createObjectURL.mock.calls[0]![0] as Blob;
  const contents = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
  expect(contents).toContain("SUMMARY:Qiyam / Tahajjud — Go Back to Sleep");
  expect(contents).not.toContain("SUMMARY:Qiyam / Tahajjud — Prayer Window");
  expect(contents).not.toContain("SUMMARY:Sixth of the Night");
  rerender(<CalendarCard result={result} dawudSelected={false} prayerSource="Manual" />);
  expect(screen.queryByLabelText(/Go Back to Sleep/)).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { hidden: true })).toHaveLength(3);
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
