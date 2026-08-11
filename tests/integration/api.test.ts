import { buildApp } from "../../apps/api/src/app";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const app = await buildApp({
  prayerTimeProvider: {
    async getPrayerTimes() {
      return {
        maghrib: "2026-07-23T20:02:00Z",
        fajr: "2026-07-24T02:15:00Z",
        timeZone: "Europe/London",
        location: "51.5074, -0.1278",
        calculationMethod: "Test method",
        source: "Test provider",
      };
    },
  },
  londonUnifiedPrayerTimeProvider: {
    async getPrayerTimes() {
      return {
        maghrib: "2026-07-23T20:04:00Z",
        fajr: "2026-07-24T02:21:00Z",
        timeZone: "Europe/London",
        location: "London",
        calculationMethod: "London Unified Prayer Timetable 2026",
        source: "London Unified test provider",
        dailyPrayerTimes: {
          serviceDate: "2026-07-23",
          fajr: "03:19",
          sunrise: "05:11",
          dhuhr: "13:12",
          asrStandard: "17:22",
          asrHanafi: "18:32",
          maghrib: "21:04",
          isha: "22:21",
        },
      };
    },
  },
});

beforeAll(() => app.ready());
afterAll(() => app.close());

describe("REST API", () => {
  it("returns health and content type", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({
      status: "ok",
      service: "prophetic-night-segments",
      version: "0.1.0",
    });
  });

  it("calculates a valid request with the documented shape", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/night/calculate",
      payload: {
        maghrib: "2026-07-23T21:02:00+01:00",
        fajr: "2026-07-24T03:15:00+01:00",
        timeZone: "Europe/London",
        fajrWakeBufferMinutes: 20,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.segments).toHaveLength(6);
    expect(body.thirds).toHaveLength(3);
    expect(body.lastThird.segments).toEqual([5, 6]);
  });

  it("returns a stable error and does not expose a stack", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/night/calculate",
      payload: { maghrib: "bad", fajr: "bad", timeZone: "UTC" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toEqual(expect.objectContaining({ code: "INVALID_TIMESTAMP" }));
    expect(response.body).not.toContain("stack");
  });

  it("sources prayer times from coordinates before calculating", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/night/calculate-from-coordinates",
      payload: {
        latitude: 51.5074,
        longitude: -0.1278,
        serviceDate: "2026-07-23",
        timeZone: "Europe/London",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        input: expect.objectContaining({ timeZone: "Europe/London" }),
        segments: expect.arrayContaining([expect.objectContaining({ number: 6 })]),
        prayerTimes: {
          provider: "Test provider",
          calculationMethod: "Test method",
          timeZone: "Europe/London",
        },
      }),
    );
  });

  it("rejects out-of-range coordinates before calling a provider", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/night/calculate-from-coordinates",
      payload: {
        latitude: 91,
        longitude: 0,
        serviceDate: "2026-07-23",
        timeZone: "Europe/London",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_REQUEST");
  });

  it("selects London Unified explicitly and returns the published prayer day", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/night/calculate-from-coordinates",
      payload: {
        latitude: 51.5074,
        longitude: -0.1278,
        serviceDate: "2026-07-23",
        timeZone: "Europe/London",
        prayerTimeSource: "london-unified",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().prayerTimes).toEqual(
      expect.objectContaining({
        provider: "London Unified test provider",
        calculationMethod: "London Unified Prayer Timetable 2026",
        dailyPrayerTimes: expect.objectContaining({
          asrStandard: "17:22",
          maghrib: "21:04",
        }),
      }),
    );
  });

  it("serves example, OpenAPI JSON, docs, and CORS", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/night/example" })).statusCode).toBe(
      200,
    );
    const spec = await app.inject({ method: "GET", url: "/api/docs/json" });
    expect(spec.statusCode).toBe(200);
    expect(spec.json().openapi).toBe("3.0.3");
    const cors = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/night/calculate",
      headers: { origin: "http://localhost:3000", "access-control-request-method": "POST" },
    });
    expect(cors.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});
