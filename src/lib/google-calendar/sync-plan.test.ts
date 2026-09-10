import { Temporal } from "@js-temporal/polyfill";
import { expect, it, vi } from "vitest";
import { calculateSyncNight, syncDates, validateSyncRequest } from "./sync-plan.server";
import { NIGHT_PART_TITLES, type NightPartEventId } from "../calendar/buildCalendarEvents";
import type { SyncRequest } from "./sync";

const input: SyncRequest = {
  startDate: "2026-03-28",
  nights: 30,
  source: { kind: "london-unified" },
  selected: [
    "last-third",
    "prayer",
    "final-sixth",
    "fajr",
    ...(Object.keys(NIGHT_PART_TITLES) as NightPartEventId[]),
  ],
  options: {
    wakeBufferMinutes: 15,
    dawudSelected: false,
    fajrPreparationMinutes: 20,
    firstAdhanMinutes: null,
  },
};
it.each([
  ["2026-03-28", "Europe/London", 11],
  ["2026-10-24", "Europe/London", 13],
  ["2026-12-31", "Asia/Kolkata", 12],
])("uses elapsed-night arithmetic across DST and offsets: %s", async (date, timeZone, hours) => {
  const next = Temporal.PlainDate.from(date).add({ days: 1 });
  const maghrib = Temporal.ZonedDateTime.from(`${date}T18:00[${timeZone}]`).toInstant();
  const fajr = Temporal.ZonedDateTime.from(`${next}T06:00[${timeZone}]`).toInstant();
  const load = vi.fn().mockResolvedValue({
    maghrib: maghrib.toString(),
    fajr: fajr.toString(),
    timeZone,
    source: "Test provider",
  });
  const events = await calculateSyncNight(input, date, load);
  const parts = events.filter((event) => event.id.startsWith("night-part-"));
  expect(parts).toHaveLength(6);
  parts.forEach((part, index) => {
    expect(Date.parse(part.start)).toBe(
      maghrib.epochMilliseconds + (hours * 3_600_000 * index) / 6,
    );
    expect(Date.parse(part.end)).toBe(
      maghrib.epochMilliseconds + (hours * 3_600_000 * (index + 1)) / 6,
    );
  });
  expect(fajr.epochMilliseconds - maghrib.epochMilliseconds).toBe(hours * 3_600_000);
  expect(Date.parse(events.find((e) => e.id === "last-third")!.start)).toBe(
    maghrib.epochMilliseconds + (hours * 3_600_000 * 2) / 3,
  );
  expect(Date.parse(events.find((e) => e.id === "final-sixth")!.start)).toBe(
    maghrib.epochMilliseconds + (hours * 3_600_000 * 5) / 6,
  );
  expect(events.find((e) => e.id === "prayer")!.end).toBe(
    events.find((e) => e.id === "fajr")!.start,
  );
});
it("rejects a provider repeating the previous night's timestamps", async () => {
  const load = vi.fn().mockResolvedValue({
    maghrib: "2026-03-27T18:00:00Z",
    fajr: "2026-03-28T06:00:00Z",
    timeZone: "Europe/London",
    source: "Test provider",
  });
  await expect(calculateSyncNight(input, "2026-03-28", load)).rejects.toThrow(
    /Prayer times are unavailable/,
  );
});
it("supports a bounded configurable horizon and preserves all AlAdhan calculation settings", () => {
  const source = {
    kind: "aladhan",
    options: {
      city: "London",
      country: "United Kingdom",
      state: "England",
      calculationMethod: 99,
      school: 1,
      latitudeAdjustmentMethod: 2,
      midnightMode: 1,
      shafaq: "abyad",
      tune: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      methodSettings: [18, null, 17],
      adjustment: 1,
    },
  };
  expect(validateSyncRequest({ ...input, nights: 7, source }).source).toEqual(source);
  expect(syncDates("2026-12-31", 2)).toEqual(["2026-12-31", "2027-01-01"]);
  expect(() =>
    validateSyncRequest({
      ...input,
      source: { ...source, options: { ...source.options, tune: [999] } },
    }),
  ).toThrow();
});
