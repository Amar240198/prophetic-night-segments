import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/auth/redirect";

describe("safeInternalPath", () => {
  it("keeps supported internal destinations and their query intent", () => {
    expect(safeInternalPath("/pricing?upgrade=1")).toBe("/pricing?upgrade=1");
    expect(safeInternalPath("/sixth#sixth-of-the-night")).toBe("/sixth#sixth-of-the-night");
  });

  it("rejects external and unsupported destinations", () => {
    expect(safeInternalPath("https://example.com/steal")).toBe("/app");
    expect(safeInternalPath("//example.com/steal")).toBe("/app");
    expect(safeInternalPath("/api/account/preferences")).toBe("/app");
    expect(safeInternalPath("/pricing\\evil")).toBe("/app");
  });
});
