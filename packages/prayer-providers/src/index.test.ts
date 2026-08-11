import { describe, expect, it, vi } from "vitest";
import {
  AlAdhanPrayerTimeProvider,
  IslamicAppPrayerTimeProvider,
  LondonUnifiedPrayerTimeProvider,
} from "./index";
import type { PrayerProviderError } from "./index";

function providerResponse(fajr: string, maghrib: string) {
  return new Response(
    JSON.stringify({
      code: 200,
      data: {
        timings: { Fajr: fajr, Maghrib: maghrib },
        meta: { timezone: "Europe/London", method: { name: "Muslim World League" } },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("AlAdhanPrayerTimeProvider", () => {
  it("uses Maghrib on the service date and Fajr on the following date", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("03:16 (BST)", "21:02 (BST)"))
      .mockResolvedValueOnce(providerResponse("03:15 (BST)", "21:01 (BST)"));
    const provider = new AlAdhanPrayerTimeProvider(fetchImplementation, "https://example.test/v1");

    const result = await provider.getPrayerTimes({
      latitude: 51.5074,
      longitude: -0.1278,
      serviceDate: "2026-07-23",
      timeZone: "Europe/London",
      calculationMethod: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        maghrib: "2026-07-23T20:02:00Z",
        fajr: "2026-07-24T02:15:00Z",
        timeZone: "Europe/London",
        calculationMethod: "Muslim World League",
      }),
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const urls = fetchImplementation.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/timings/23-07-2026"),
        expect.stringContaining("/timings/24-07-2026"),
      ]),
    );
    expect(urls.every((url) => url.includes("method=3"))).toBe(true);
    expect(urls.every((url) => url.includes("timezonestring=Europe%2FLondon"))).toBe(true);
  });

  it("requires a valid explicit timezone without making a request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const provider = new AlAdhanPrayerTimeProvider(fetchImplementation);

    await expect(
      provider.getPrayerTimes({
        latitude: 51.5,
        longitude: -0.1,
        serviceDate: "2026-07-23",
        timeZone: "Invalid/Zone",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({ code: "INVALID_PROVIDER_INPUT" }),
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a provider timezone that differs from the requested timezone", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(providerResponse("03:16", "21:02"))
      .mockResolvedValueOnce(providerResponse("03:15", "21:01"));
    const provider = new AlAdhanPrayerTimeProvider(fetchImplementation);

    await expect(
      provider.getPrayerTimes({
        latitude: 51.5,
        longitude: -0.1,
        serviceDate: "2026-07-23",
        timeZone: "Europe/Paris",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({ code: "INVALID_PROVIDER_RESPONSE" }),
    );
  });

  it("rejects invalid coordinates without making a request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const provider = new AlAdhanPrayerTimeProvider(fetchImplementation);
    await expect(
      provider.getPrayerTimes({ latitude: 100, longitude: 0, serviceDate: "2026-01-01" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({
        code: "INVALID_PROVIDER_INPUT",
      }),
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("LondonUnifiedPrayerTimeProvider", () => {
  it("uses published Maghrib and following Fajr across British Summer Time", async () => {
    const provider = new LondonUnifiedPrayerTimeProvider();

    await expect(
      provider.getPrayerTimes({
        latitude: 51.5074,
        longitude: -0.1278,
        serviceDate: "2026-07-23",
        timeZone: "Europe/London",
      }),
    ).resolves.toEqual({
      maghrib: "2026-07-23T20:04:00Z",
      fajr: "2026-07-24T02:21:00Z",
      timeZone: "Europe/London",
      location: "London",
      calculationMethod: "London Unified Prayer Timetable 2026",
      source: "London Salah Timetable Unified Ulama Committee",
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
    });
  });

  it("rejects unsupported years and non-London timezones", async () => {
    const provider = new LondonUnifiedPrayerTimeProvider();
    await expect(
      provider.getPrayerTimes({
        latitude: 51.5074,
        longitude: -0.1278,
        serviceDate: "2026-07-23",
        timeZone: "Europe/Paris",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({ code: "INVALID_PROVIDER_INPUT" }),
    );
    await expect(
      provider.getPrayerTimes({
        latitude: 51.5074,
        longitude: -0.1278,
        serviceDate: "2027-07-23",
        timeZone: "Europe/London",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({ code: "INVALID_PROVIDER_INPUT" }),
    );
  });

  it("normalises the following Fajr correctly across the spring DST transition", async () => {
    const provider = new LondonUnifiedPrayerTimeProvider();
    const result = await provider.getPrayerTimes({
      latitude: 51.5074,
      longitude: -0.1278,
      serviceDate: "2026-03-28",
      timeZone: "Europe/London",
    });
    expect(result.maghrib).toBe("2026-03-28T18:29:00Z");
    expect(result.fajr).toBe("2026-03-29T04:18:00Z");
  });

  it("rejects London Unified for coordinates far outside London", async () => {
    const provider = new LondonUnifiedPrayerTimeProvider();
    await expect(
      provider.getPrayerTimes({
        latitude: 53.4808,
        longitude: -2.2426,
        serviceDate: "2026-07-23",
        timeZone: "Europe/London",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({ code: "INVALID_PROVIDER_INPUT" }),
    );
  });
});

describe("IslamicAppPrayerTimeProvider", () => {
  it("uses the requested timezone and two consecutive local dates", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            code: 200,
            data: {
              timings: { Fajr: "03:15", Maghrib: "21:02" },
              meta: { timezone: "Europe/London", method: 3 },
            },
          }),
          { status: 200 },
        ),
    );
    const provider = new IslamicAppPrayerTimeProvider(
      fetchImplementation,
      "https://example.test/v1",
    );

    const result = await provider.getPrayerTimes({
      latitude: 51.5074,
      longitude: -0.1278,
      serviceDate: "2026-07-23",
      timeZone: "Europe/London",
      calculationMethod: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        maghrib: "2026-07-23T20:02:00Z",
        fajr: "2026-07-24T02:15:00Z",
        source: "islamic.app prayer-times API",
      }),
    );
    const urls = fetchImplementation.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("/timings/23-07-2026"),
        expect.stringContaining("/timings/24-07-2026"),
      ]),
    );
    expect(urls.every((url) => url.includes("timezone=Europe%2FLondon"))).toBe(true);
  });

  it("requires a valid explicit timezone without making a request", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const provider = new IslamicAppPrayerTimeProvider(fetchImplementation);
    await expect(
      provider.getPrayerTimes({
        latitude: 51.5,
        longitude: -0.1,
        serviceDate: "2026-07-23",
        timeZone: "Invalid/Zone",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PrayerProviderError>>({ code: "INVALID_PROVIDER_INPUT" }),
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
