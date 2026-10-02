import { expect, it } from "vitest";
import { parseLocale, translate } from "./config";
it("defaults invalid or missing locales to English", () => {
  for (const value of [undefined, null, "fr", "__proto__", "AR", {}])
    expect(parseLocale(value)).toBe("en");
  expect(parseLocale("ar")).toBe("ar");
  expect(parseLocale("en")).toBe("en");
});
it("falls back to English without undefined or prototype-property collisions", () => {
  for (const copy of ["A new English message", "constructor", "toString", "__proto__", ""])
    expect(translate("ar", copy)).toBe(copy);
  expect(translate("en", "Qaylula")).toBe("Qaylula");
});
it("translates the agreed terminology consistently", () => {
  expect(
    ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Qiyām", "Qaylula", "Sixth of the Night"].map(
      (copy) => translate("ar", copy),
    ),
  ).toEqual(["الفجر", "الظهر", "العصر", "المغرب", "العشاء", "قيام الليل", "القيلولة", "سدس الليل"]);
});
it("interpolates raw values once and never pattern-translates data or identifiers", () => {
  expect(translate("ar", "At {anchor}", { anchor: "Settings" })).toBe("عند Settings");
  expect(translate("ar", "At {anchor}", { anchor: "user@example.com" })).toBe(
    "عند user@example.com",
  );
  for (const value of [
    "At a custom meeting",
    "20 minutes before Qaylula",
    "2026-10-02T13:00:00Z",
    "51.5",
    "£4.99/month",
    "qaylula",
    "price_123",
    "PRO_REQUIRED",
  ])
    expect(translate("ar", value)).toBe(value);
  expect(translate("ar", "At {anchor}", { anchor: "{minutes}" })).toBe("عند {minutes}");
});
