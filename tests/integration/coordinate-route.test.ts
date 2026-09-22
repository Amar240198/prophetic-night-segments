import { afterEach, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/night/calculate-from-coordinates/route";
import { loadSyncNight, validateSyncRequest } from "@/lib/google-calendar/sync-plan.server";

const input = {
  latitude: 51.5007292,
  longitude: -0.1246254,
  serviceDate: "2026-03-28",
  timeZone: "Europe/London",
  calculationMethod: 3,
};
function request(body: unknown) {
  return new Request("https://example.test/api/v1/night/calculate-from-coordinates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function providerFetch() {
  return vi.fn(async (input: RequestInfo | URL) =>
    Response.json({
      code: 200,
      data: {
        date: { gregorian: { date: new URL(String(input)).pathname.split("/").at(-1) } },
        timings: {
          Fajr: "05:00",
          Sunrise: "06:30",
          Dhuhr: "12:00",
          Asr: "15:00",
          Maghrib: "18:00",
          Isha: "20:00",
          Midnight: "00:00",
        },
        meta: { timezone: "Europe/London", method: { name: "Muslim World League" } },
      },
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

it("uses AlAdhan with exact GPS coordinates and the next local date across DST", async () => {
  const fetcher = providerFetch();
  vi.stubGlobal("fetch", fetcher);
  const response = await POST(request(input));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.input).toMatchObject({
    maghrib: "2026-03-28T18:00:00Z",
    fajr: "2026-03-29T04:00:00Z",
    timeZone: "Europe/London",
  });
  expect(result.prayerTimes.provider).toBe("AlAdhan prayer-times API");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const urls = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)));
  expect(urls.map((url) => url.pathname)).toEqual([
    "/v1/timings/28-03-2026",
    "/v1/timings/29-03-2026",
  ]);
  for (const url of urls) {
    expect(url.hostname).toBe("api.aladhan.com");
    expect(url.searchParams.get("latitude")).toBe(String(input.latitude));
    expect(url.searchParams.get("longitude")).toBe(String(input.longitude));
    expect(url.searchParams.get("timezonestring")).toBe(input.timeZone);
    expect(url.searchParams.get("method")).toBe("3");
  }
});
it.each([
  null,
  [],
  { ...input, latitude: 91 },
  { ...input, timeZone: "Invalid/Zone" },
  { ...input, serviceDate: "2026-02-30" },
  { ...input, prayerTimeSource: "london-unified" },
])("rejects invalid input before provider access: %j", async (body) => {
  const fetcher = providerFetch();
  vi.stubGlobal("fetch", fetcher);
  expect((await POST(request(body))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([new Error("secret upstream detail"), new DOMException("secret timeout", "TimeoutError")])(
  "returns an actionable safe error and allows a retry",
  async (error) => {
    const fetcher = vi.fn().mockRejectedValue(error);
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(request(input));
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.message).toContain("Try again");
    expect(JSON.stringify(body)).not.toContain("secret");
    vi.stubGlobal("fetch", providerFetch());
    expect((await POST(request(input))).status).toBe(200);
  },
);
it("rejects a malformed upstream success response", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json({ code: 200, data: {} })),
  );
  const response = await POST(request(input));
  expect(response.status).toBe(502);
  expect((await response.json()).error.code).toBe("INVALID_PROVIDER_RESPONSE");
});
it("pins new coordinate sync to AlAdhan while preserving the legacy provider", async () => {
  const source = { kind: "coordinates" as const, ...input, provider: "aladhan" as const };
  const sync = {
    source,
    startDate: input.serviceDate,
    nights: 1,
    selected: ["last-third"],
    options: {
      wakeBufferMinutes: 0,
      dawudSelected: false,
      fajrPreparationMinutes: 0,
      firstAdhanMinutes: null,
    },
  };
  expect(validateSyncRequest(sync).source).toMatchObject({ provider: "aladhan" });
  expect(() =>
    validateSyncRequest({ ...sync, source: { ...source, provider: "unknown" } }),
  ).toThrow();
  vi.stubGlobal("fetch", providerFetch());
  expect((await loadSyncNight(source, input.serviceDate)).source).toBe("AlAdhan API");
  const legacy = { ...source, provider: undefined };
  vi.stubGlobal("fetch", providerFetch());
  expect((await loadSyncNight(legacy, input.serviceDate)).source).toBe(
    "islamic.app prayer-times API",
  );
});
