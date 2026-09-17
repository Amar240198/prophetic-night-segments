import { describe, expect, it } from "vitest";
import { fastingDates, islamicCivilDate } from "./schedule";
describe("fasting schedules", () => {
  it("generates independent Monday and Thursday programmes", () => {
    expect(fastingDates("2026-09-14", 4, ["monday", "thursday"]).map((x) => x.kind)).toEqual([
      "fasting-monday",
      "fasting-thursday",
    ]);
  });
  it("supports deterministic Dawud anchors", () => {
    expect(
      fastingDates("2026-09-14", 4, ["dawud"], { date: "2026-09-14", fasting: true }).map(
        (x) => x.date,
      ),
    ).toEqual(["2026-09-14", "2026-09-16"]);
  });
  it("keeps White Days behind a replaceable Hijri abstraction", () => {
    const hijri = islamicCivilDate("2026-09-24");
    expect(hijri.month).toBeGreaterThan(0);
    expect(
      fastingDates("2026-09-01", 60, ["white-days"]).every((x) => x.kind === "fasting-white-day"),
    ).toBe(true);
  });
});
