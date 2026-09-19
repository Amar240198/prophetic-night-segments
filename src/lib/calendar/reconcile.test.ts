import { describe, expect, it } from "vitest";
import { planCalendarReconciliation, type CurrentCalendarEntry } from "./reconcile";
import { buildRoutineCalendarEvent } from "../routines/occurrences";
import type { Routine } from "../routines/model";
const routine: Routine = {
  id: "one",
  name: "Adhkar",
  type: "dhikr",
  enabled: true,
  durationMinutes: 15,
  recurrence: "daily",
  timing: { kind: "relative", anchor: "asr", offsetMinutes: 15 },
  createdAt: "",
  updatedAt: "",
};
const event = buildRoutineCalendarEvent({
  routine,
  localDate: "2026-09-19",
  timezone: "UTC",
  prayerSchedule: { asr: "2026-09-19T16:05:00Z" },
})!;
const desired = { logicalId: "owner/one/2026-09-19", event };
const current: CurrentCalendarEntry = {
  ...desired,
  providerId: "stable-provider-id",
  ownershipVerified: true,
  tombstoned: false,
};
const scope = {
  startDate: "2026-09-19",
  endDate: "2026-09-20",
  allowedLogicalIds: new Set([desired.logicalId]),
  allowRemoval: true,
};
describe("desired calendar reconciliation", () => {
  it("creates missing occurrences and keeps identical ones", () => {
    expect(planCalendarReconciliation([desired], [], scope).create).toEqual([desired]);
    expect(planCalendarReconciliation([desired], [current], scope).keep).toEqual([current]);
  });
  it("updates a moving dependency with the same provider and logical identities", () => {
    const moved = buildRoutineCalendarEvent({
      routine,
      localDate: "2026-09-19",
      timezone: "UTC",
      prayerSchedule: { asr: "2026-09-19T16:03:00Z" },
    })!;
    expect(moved.id).toBe(event.id);
    const plan = planCalendarReconciliation([{ ...desired, event: moved }], [current], scope);
    expect(plan.create).toEqual([]);
    expect(plan.update[0]?.current.providerId).toBe(current.providerId);
    expect(plan.update[0]?.desired.event.start).toBe("2026-09-19T16:18:00Z");
  });
  it("removes only authorised obsolete owned events", () => {
    expect(planCalendarReconciliation([], [current], scope).remove).toEqual([current]);
    for (const item of [
      { ...current, ownershipVerified: false },
      { ...current, tombstoned: true },
    ])
      expect(planCalendarReconciliation([], [item], scope).remove).toEqual([]);
    expect(
      planCalendarReconciliation([], [current], { ...scope, allowRemoval: false }).remove,
    ).toEqual([]);
    expect(
      planCalendarReconciliation([], [current], { ...scope, allowedLogicalIds: new Set() }).remove,
    ).toEqual([]);
    expect(
      planCalendarReconciliation([], [current], { ...scope, startDate: "2026-09-20" }).remove,
    ).toEqual([]);
  });
  it("never resurrects tombstones or overwrites unverified events", () => {
    for (const item of [
      { ...current, ownershipVerified: false },
      { ...current, tombstoned: true },
    ]) {
      const result = planCalendarReconciliation([desired], [item], scope);
      expect(result.blocked).toEqual([desired.logicalId]);
      expect(result.create).toEqual([]);
      expect(result.update).toEqual([]);
    }
  });
  it("rejects ambiguous duplicate identities", () => {
    expect(() => planCalendarReconciliation([desired, desired], [], scope)).toThrow(
      "DUPLICATE_LOGICAL_ID",
    );
    expect(() => planCalendarReconciliation([], [current, current], scope)).toThrow(
      "DUPLICATE_LOGICAL_ID",
    );
  });
});
