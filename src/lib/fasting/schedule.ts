import { Temporal } from "@js-temporal/polyfill";

export type FastingProgramme = "monday" | "thursday" | "white-days" | "dawud";
export interface DawudAnchor {
  date: string;
  fasting: boolean;
}

export function islamicCivilDate(date: string): { year: number; month: number; day: number } {
  const g = Temporal.PlainDate.from(date);
  // Arithmetic Hijri conversion, isolated behind this replaceable provider boundary.
  const a = Math.floor((14 - g.month) / 12);
  const y = g.year + 4800 - a;
  const m = g.month + 12 * a - 3;
  const julian =
    g.day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  const l = julian - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const ll = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - ll) / 5316) * Math.floor((50 * ll) / 17719) +
    Math.floor(ll / 5670) * Math.floor((43 * ll) / 15238);
  const value =
    ll -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * value) / 709);
  return { year: 30 * n + j - 30, month, day: value - Math.floor((709 * month) / 24) };
}

export function fastingDates(
  startDate: string,
  days: number,
  programmes: readonly FastingProgramme[],
  anchor?: DawudAnchor,
): Array<{ date: string; kind: string }> {
  const start = Temporal.PlainDate.from(startDate);
  return Array.from({ length: days }, (_, index) => start.add({ days: index })).flatMap((date) => {
    const output: Array<{ date: string; kind: string }> = [];
    if (programmes.includes("monday") && date.dayOfWeek === 1)
      output.push({ date: date.toString(), kind: "fasting-monday" });
    if (programmes.includes("thursday") && date.dayOfWeek === 4)
      output.push({ date: date.toString(), kind: "fasting-thursday" });
    const hijri = islamicCivilDate(date.toString());
    if (programmes.includes("white-days") && [13, 14, 15].includes(hijri.day))
      output.push({ date: date.toString(), kind: "fasting-white-day" });
    if (programmes.includes("dawud") && anchor) {
      const delta = Temporal.PlainDate.from(anchor.date).until(date, { largestUnit: "days" }).days;
      if (delta >= 0 && delta % 2 === (anchor.fasting ? 0 : 1))
        output.push({ date: date.toString(), kind: "fasting-dawud" });
    }
    return output;
  });
}
