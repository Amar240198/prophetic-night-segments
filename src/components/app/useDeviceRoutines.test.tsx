// @vitest-environment jsdom
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDeviceRoutines } from "./useDeviceRoutines";
const row = {
  id: "server-id",
  name: "Evening Adhkar",
  type: "dhikr",
  enabled: true,
  duration_minutes: 15,
  recurrence: "daily",
  timing_rule: { kind: "relative", anchor: "asr", offsetMinutes: 15 },
  created_at: "2026-09-19",
  updated_at: "2026-09-19",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
it("reads account data without importing device routines and saves by server identity", async () => {
  localStorage.setItem("miqat.routines.v1", JSON.stringify([{ name: "Another account" }]));
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ routines: [row] }))
    .mockResolvedValueOnce(Response.json({ routine: { ...row, enabled: false } }))
    .mockResolvedValueOnce(Response.json({ routines: [{ ...row, enabled: false }] }));
  vi.stubGlobal("fetch", fetcher);
  const { result } = renderHook(() => useDeviceRoutines());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.routines.map((r) => r.name)).toEqual([row.name]);
  await act(async () => {
    expect(await result.current.save([{ ...result.current.routines[0]!, enabled: false }])).toBe(
      true,
    );
  });
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/account/routines?id=server-id");
  expect(fetcher.mock.calls[1]?.[1].method).toBe("PUT");
  expect(result.current.routines[0]?.enabled).toBe(false);
});
it("reports failed writes and retains the saved account state", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ routines: [row] }))
      .mockResolvedValueOnce(new Response(null, { status: 500 })),
  );
  const { result } = renderHook(() => useDeviceRoutines());
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => {
    expect(await result.current.save([])).toBe(false);
  });
  expect(result.current.routines).toHaveLength(1);
  expect(result.current.error).toContain("could not be saved");
});
