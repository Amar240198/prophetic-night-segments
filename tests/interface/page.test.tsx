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
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
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
    expect(screen.getByText(/Six mathematically exact portions/)).toBeInTheDocument();
    expect(screen.getByText(/published 2026 London Unified timetable/)).toBeInTheDocument();
  });

  it("passes provider output into the shared engine and renders exact segments", async () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Service date"), {
      target: { value: "2026-07-23" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate this night" }));

    await waitFor(() => expect(screen.getByText("Six-part timeline")).toBeInTheDocument());
    expect(screen.getAllByText("LAST THIRD")).toHaveLength(2);
    expect(screen.getAllByText(/beginning of Part 5/).length).toBeGreaterThan(0);
    expect(screen.getByText("Alarm planning")).toBeInTheDocument();
    expect(screen.getByText("Developer output")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
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

    await screen.findByText("Six-part timeline");
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText("Trusted timetable / manual input")).toBeInTheDocument();
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
