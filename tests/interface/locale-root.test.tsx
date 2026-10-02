import React from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
const cookie = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookie.value === undefined ? undefined : { value: cookie.value }),
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app" }));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
import RootLayout from "@/app/layout";
it.each([
  [undefined, "en", "ltr"],
  ["en", "en", "ltr"],
  ["ar", "ar", "rtl"],
  ["bad", "en", "ltr"],
])(
  "server-renders persisted locale %s without requiring an account",
  async (value, language, direction) => {
    cookie.value = value;
    const html = renderToString(await RootLayout({ children: <p>Public</p> }));
    expect(html).toContain(`lang="${language}"`);
    expect(html).toContain(`dir="${direction}"`);
    expect((html.match(/class="language-picker"/g) ?? []).length).toBe(1);
  },
);
