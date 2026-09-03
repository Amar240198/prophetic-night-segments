// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../../src/app/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        maghrib: "2026-07-23T20:02:00Z",
        fajr: "2026-07-24T02:15:00Z",
        timeZone: "Europe/London",
        location: "London, United Kingdom",
        calculationMethod: "London Unified Prayer Timetable 2026",
        juristicSchool: "Standard",
        source: "London Unified",
        serviceDate: "2026-07-23",
      }),
    }),
  );
});

describe("Prophetic Night Segments interface", () => {
  it("renders the canonical product identity and provider boundary", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Prophetic Night Segments" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/One night, shown through its conventional thirds/),
    ).toBeInTheDocument();
    expect(screen.getByText(/published 2026 London Unified timetable/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Fajr preparation buffer")).not.toBeInTheDocument();
  });

  it("passes provider output into the shared engine and renders exact segments", async () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Service date"), {
      target: { value: "2026-07-23" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Conventional Night Division" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("First Third")).toBeInTheDocument();
    expect(screen.getByText("Middle Third")).toBeInTheDocument();
    expect(screen.getByText("Last Third")).toBeInTheDocument();
    expect(screen.queryByText("Part 1")).not.toBeInTheDocument();
    expect(screen.getByText("Alarm planning")).toBeInTheDocument();
    expect(screen.queryByText("Developer output")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy JSON" })).not.toBeInTheDocument();
  });

  it("calculates from trusted manual timetable values without calling a provider", async () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Prayer-time source"), {
      target: { value: "manual" },
    });
    fireEvent.change(screen.getByLabelText("Service date"), {
      target: { value: "2026-07-23" },
    });
    fireEvent.change(screen.getByLabelText("Maghrib"), { target: { value: "21:02" } });
    fireEvent.change(screen.getByLabelText(/Following Fajr/), { target: { value: "03:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));

    await screen.findByRole("heading", { name: "Conventional Night Division" });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Trusted timetable / manual input")).toBeInTheDocument();
  });

  it("calculates the optional First Adhan Reminder from the following Fajr", async () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("First Adhan Reminder"), {
      target: { value: "30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));

    await screen.findByRole("heading", { name: "End of the calculated night" });
    const schedule = screen.getByRole("list");
    expect(schedule).toHaveTextContent("Buffer Wake-Up Time");
    expect(schedule).toHaveTextContent("First Adhan Reminder");
    expect(schedule).toHaveTextContent("2:45");
    expect(schedule).toHaveTextContent("Buffer Before Fajr");
    expect(schedule).toHaveTextContent("Fajr");
    expect(screen.getByText(/true dawn \(al-Fajr al-Ṣādiq\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Fajr al-Kādhib/i)).not.toBeInTheDocument();
  });

  it("presents thirds, the Dawud pattern, and Prophetic qiyam as views of one night", async () => {
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));

    await screen.findByRole("heading", { name: "Conventional Night Division" });
    expect(screen.getByRole("tab", { name: "General Night Division" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Dawud عليه السلام Pattern" }));
    expect(screen.getByRole("heading", { name: "Dawud عليه السلام Pattern" })).toBeInTheDocument();
    expect(screen.getByText("Sleep · Parts 1–3")).toBeInTheDocument();
    expect(screen.getByText("Pray · Parts 4–5")).toBeInTheDocument();
    expect(screen.getByText("Sleep · Part 6")).toBeInTheDocument();
    expect(screen.getByText("Part 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Prophetic Qiyam" }));
    expect(screen.getByRole("heading", { name: "Prophetic Qiyam Timeline" })).toBeInTheDocument();
    expect(
      screen.getByText(/not restricted to one fixed half–third–sixth schedule/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Part 1")).not.toBeInTheDocument();
    expect(screen.getByText("Maghrib · night begins")).toBeInTheDocument();
    expect(screen.getByText("Fajr · night ends")).toBeInTheDocument();

    fireEvent.click(screen.getByText("About these views"));
    expect(screen.getByText(/These views describe the same night/)).toBeInTheDocument();
  });

  it("requests a fresh precise browser location", () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementation((success) =>
        success({ coords: { latitude: 51.5007292, longitude: -0.1246254, accuracy: 7.4 } }),
      );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Prayer-time source"), {
      target: { value: "coordinates" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use my precise location" }));

    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    });
    expect(screen.getByLabelText("Latitude")).toHaveValue(51.5007292);
    expect(screen.getByLabelText("Longitude")).toHaveValue(-0.1246254);
    expect(screen.getByText(/approximately 7 m accuracy/)).toBeInTheDocument();
  });

  it("surfaces stable provider errors without exposing internals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "Prayer times are temporarily unavailable.",
          },
        }),
      }),
    );
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Prayer times are temporarily unavailable.",
    );
  });
});
