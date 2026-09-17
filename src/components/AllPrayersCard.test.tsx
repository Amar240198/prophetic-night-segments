// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllPrayersCard } from "./AllPrayersCard";

vi.mock("./GoogleCalendarSection", () => ({
  GoogleCalendarSection: () => <div data-testid="google-calendar" />,
}));

const schedule = {
  date: "2026-03-28",
  timeZone: "Europe/London",
  source: "Published timetable",
  fajr: "05:10",
  sunrise: "06:00",
  dhuhr: "12:10",
  asr: "15:20",
  maghrib: "18:30",
  isha: "20:00",
};

describe("All Prayers card", () => {
  afterEach(cleanup);
  it("shows Sunrise as informational and selects only the five obligatory prayers", () => {
    render(<AllPrayersCard schedule={schedule} />);
    expect(screen.getByText(/Sunrise/)).toBeInTheDocument();
    expect(screen.getByText("informational")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
    expect(screen.getByText(/Next prayer/)).toBeInTheDocument();
  });

  it("supports selecting an individual prayer and Add all prayers", () => {
    render(<AllPrayersCard schedule={schedule} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    expect(boxes[0]).not.toBeChecked();
    fireEvent.click(screen.getAllByRole("button", { name: "Add all prayers" })[0]!);
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);
  });
});
