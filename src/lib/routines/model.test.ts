import { describe, expect, it } from "vitest";
import { validateRoutine } from "./model";
describe("routine model", () => {
  it("accepts fixed and prayer-relative routines", () => {
    expect(
      validateRoutine({
        name: "Qur’an",
        type: "quran",
        durationMinutes: 20,
        timing: { kind: "relative", anchor: "fajr", offsetMinutes: 10 },
      }).enabled,
    ).toBe(true);
  });
  it("rejects invalid rules", () => {
    expect(() =>
      validateRoutine({
        name: "",
        type: "custom",
        durationMinutes: -1,
        timing: { kind: "fixed", time: "bad" },
      }),
    ).toThrow("INVALID_ROUTINE");
  });
});
