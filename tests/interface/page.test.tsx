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
    expect(screen.getByText(/beginning of Part 5/)).toBeInTheDocument();
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
