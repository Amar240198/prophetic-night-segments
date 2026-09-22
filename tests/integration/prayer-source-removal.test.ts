import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/prayer-times/route";

it("rejects the removed city source without calling a remote provider", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  try {
    const response = await GET(
      new NextRequest(
        "https://example.test/api/prayer-times?source=london-unified&city=London&country=United%20Kingdom&date=2026-12-01",
      ),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_SOURCE");
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
