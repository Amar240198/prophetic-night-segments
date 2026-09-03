"use client";

import { Temporal } from "@js-temporal/polyfill";
import { calculateNightSegments as calculateSharedNightSegments } from "@prophetic-night/night-engine";
import type { NightCalculationInput, NightCalculationResult } from "@prophetic-night/night-engine";
import { demoPrayerTimes } from "@prophetic-night/prayer-providers";
import { NightEndTimeline, ScheduleTools } from "@/components/ScheduleTools";
import { useMemo, useState } from "react";

type Activity = "Initial sleep" | "Prayer" | "Final sleep";

type Segment = {
  number: number;
  start: string;
  end: string;
  durationMilliseconds: number;
  third: "First third" | "Second third" | "Last third";
  activity: Activity;
  isWithinLastThird: boolean;
};

type Calculation = {
  start: string;
  end: string;
  durationMilliseconds: number;
  boundaries: string[];
  segments: Segment[];
  midpoint: string;
  lastThirdStart: string;
  finalSixthStart: string;
};

type LivePrayerTimes = {
  maghrib: string;
  fajr: string;
  timeZone: string;
  location: string;
  calculationMethod: string;
  juristicSchool: string;
  source: string;
  serviceDate: string;
};

type CoordinateCalculationResponse = NightCalculationResult & {
  prayerTimes: { provider: string; calculationMethod: string; timeZone: string };
};

const firstAdhanOptions = [15, 20, 30, 45, 60] as const;

const locations = [
  { id: "custom", country: "", city: "", countryCode: "", latitude: 0, longitude: 0 },
  {
    id: "gb-london",
    country: "United Kingdom",
    city: "London",
    countryCode: "GB",
    latitude: 51.5074,
    longitude: -0.1278,
  },
  {
    id: "gb-birmingham",
    country: "United Kingdom",
    city: "Birmingham",
    countryCode: "GB",
    latitude: 52.4862,
    longitude: -1.8904,
  },
  {
    id: "gb-manchester",
    country: "United Kingdom",
    city: "Manchester",
    countryCode: "GB",
    latitude: 53.4808,
    longitude: -2.2426,
  },
  {
    id: "gb-glasgow",
    country: "United Kingdom",
    city: "Glasgow",
    countryCode: "GB",
    latitude: 55.8642,
    longitude: -4.2518,
  },
  {
    id: "sa-makkah",
    country: "Saudi Arabia",
    city: "Makkah",
    countryCode: "SA",
    latitude: 21.3891,
    longitude: 39.8579,
  },
  {
    id: "sa-madinah",
    country: "Saudi Arabia",
    city: "Madinah",
    countryCode: "SA",
    latitude: 24.5247,
    longitude: 39.5692,
  },
  {
    id: "sa-riyadh",
    country: "Saudi Arabia",
    city: "Riyadh",
    countryCode: "SA",
    latitude: 24.7136,
    longitude: 46.6753,
  },
  {
    id: "ae-dubai",
    country: "United Arab Emirates",
    city: "Dubai",
    countryCode: "AE",
    latitude: 25.2048,
    longitude: 55.2708,
  },
  {
    id: "qa-doha",
    country: "Qatar",
    city: "Doha",
    countryCode: "QA",
    latitude: 25.2854,
    longitude: 51.531,
  },
  {
    id: "eg-cairo",
    country: "Egypt",
    city: "Cairo",
    countryCode: "EG",
    latitude: 30.0444,
    longitude: 31.2357,
  },
  {
    id: "tr-istanbul",
    country: "Türkiye",
    city: "Istanbul",
    countryCode: "TR",
    latitude: 41.0082,
    longitude: 28.9784,
  },
  {
    id: "id-jakarta",
    country: "Indonesia",
    city: "Jakarta",
    countryCode: "ID",
    latitude: -6.2088,
    longitude: 106.8456,
  },
  {
    id: "my-kuala-lumpur",
    country: "Malaysia",
    city: "Kuala Lumpur",
    countryCode: "MY",
    latitude: 3.139,
    longitude: 101.6869,
  },
  {
    id: "pk-karachi",
    country: "Pakistan",
    city: "Karachi",
    countryCode: "PK",
    latitude: 24.8607,
    longitude: 67.0011,
  },
  {
    id: "pk-lahore",
    country: "Pakistan",
    city: "Lahore",
    countryCode: "PK",
    latitude: 31.5204,
    longitude: 74.3587,
  },
  {
    id: "in-delhi",
    country: "India",
    city: "Delhi",
    countryCode: "IN",
    latitude: 28.6139,
    longitude: 77.209,
  },
  {
    id: "bd-dhaka",
    country: "Bangladesh",
    city: "Dhaka",
    countryCode: "BD",
    latitude: 23.8103,
    longitude: 90.4125,
  },
  {
    id: "np-kathmandu",
    country: "Nepal",
    city: "Kathmandu",
    countryCode: "NP",
    latitude: 27.7172,
    longitude: 85.324,
  },
  {
    id: "za-cape-town",
    country: "South Africa",
    city: "Cape Town",
    countryCode: "ZA",
    latitude: -33.9249,
    longitude: 18.4241,
  },
  {
    id: "no-oslo",
    country: "Norway",
    city: "Oslo",
    countryCode: "NO",
    latitude: 59.9139,
    longitude: 10.7522,
  },
  {
    id: "au-sydney",
    country: "Australia",
    city: "Sydney",
    countryCode: "AU",
    latitude: -33.8688,
    longitude: 151.2093,
  },
  {
    id: "au-adelaide",
    country: "Australia",
    city: "Adelaide",
    countryCode: "AU",
    latitude: -34.9285,
    longitude: 138.6007,
  },
  {
    id: "us-new-york",
    country: "United States",
    city: "New York",
    countryCode: "US",
    latitude: 40.7128,
    longitude: -74.006,
  },
  {
    id: "ca-toronto",
    country: "Canada",
    city: "Toronto",
    countryCode: "CA",
    latitude: 43.6532,
    longitude: -79.3832,
  },
] as const;

const calculationMethods = [
  { id: 0, label: "Shia Ithna-Ashari" },
  { id: 1, label: "University of Islamic Sciences Karachi" },
  { id: 2, label: "ISNA" },
  { id: 3, label: "Muslim World League" },
  { id: 4, label: "Umm al-Qura" },
  { id: 5, label: "Egyptian General Authority" },
  { id: 7, label: "Institute of Geophysics Tehran" },
  { id: 8, label: "Gulf Region" },
  { id: 9, label: "Kuwait" },
  { id: 10, label: "Qatar" },
  { id: 11, label: "Majlis Ugama Islam Singapore" },
  { id: 12, label: "Union Organization France" },
  { id: 13, label: "Diyanet Turkey" },
  { id: 14, label: "Spiritual Administration of Muslims of Russia" },
  { id: 15, label: "Moonsighting Committee Worldwide" },
  { id: 16, label: "Dubai" },
  { id: 17, label: "JAKIM, Malaysia" },
  { id: 18, label: "Tunisia" },
  { id: 19, label: "Algeria" },
  { id: 20, label: "Kementerian Agama Republik Indonesia" },
  { id: 21, label: "Morocco" },
  { id: 22, label: "Comunidade Islâmica de Lisboa" },
  { id: 23, label: "Ministry of Awqaf, Jordan" },
  { id: 99, label: "Custom method" },
] as const;

const countryCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  );
const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const countries = countryCodes
  .map((code) => ({ code, name: regionNames.of(code) ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name));

const activityByPart: Activity[] = [
  "Initial sleep",
  "Initial sleep",
  "Initial sleep",
  "Prayer",
  "Prayer",
  "Final sleep",
];

const thirdByPart: Segment["third"][] = [
  "First third",
  "First third",
  "Second third",
  "Second third",
  "Last third",
  "Last third",
];

/**
 * Pure night-segmentation function.
 *
 * Each boundary is derived from the original Maghrib instant and total duration.
 * It never repeatedly adds a rounded sixth. B6 is always the supplied Fajr.
 */
function mapNightSegments(result: NightCalculationResult): Calculation {
  const boundaries = result.boundaries.map((boundary) => boundary.instant);
  const segments = result.segments.map((segment): Segment => ({
    number: segment.number,
    start: segment.start,
    end: segment.end,
    durationMilliseconds: segment.durationMilliseconds,
    third: thirdByPart[segment.number - 1]!,
    activity: activityByPart[segment.number - 1]!,
    isWithinLastThird: segment.isWithinLastThird,
  }));

  return {
    start: result.night.start,
    end: result.night.end,
    durationMilliseconds: result.night.durationMilliseconds,
    boundaries,
    segments,
    midpoint: result.midpoint,
    lastThirdStart: result.lastThird.start,
    finalSixthStart: result.dawudPattern.finalSleep.start,
  };
}

function formatTime(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return "Invalid timezone";
  }
}

function formatPrayerTime(value: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch {
    return "Invalid timezone";
  }
}

function formatDuration(milliseconds: number) {
  const totalMinutes = Math.round(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatCalendarDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default function Home() {
  const [locationId, setLocationId] = useState("gb-london");
  const [countryCode, setCountryCode] = useState("GB");
  const [city, setCity] = useState("London");
  const [state, setState] = useState("");
  const [serviceDate, setServiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState(3);
  const [school, setSchool] = useState(0);
  const [prayerTimeSource, setPrayerTimeSource] = useState<
    "london-unified" | "aladhan" | "coordinates" | "manual"
  >("london-unified");
  const [latitude, setLatitude] = useState("51.5074");
  const [longitude, setLongitude] = useState("-0.1278");
  const [coordinateTimeZone, setCoordinateTimeZone] = useState("Europe/London");
  const [locating, setLocating] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [manualMaghrib, setManualMaghrib] = useState("21:02");
  const [manualFajr, setManualFajr] = useState("03:15");
  const [manualTimeZone, setManualTimeZone] = useState("Europe/London");
  const [fajrBufferMinutes, setFajrBufferMinutes] = useState(20);
  const [latitudeAdjustmentMethod, setLatitudeAdjustmentMethod] = useState(3);
  const [midnightMode, setMidnightMode] = useState(0);
  const [shafaq, setShafaq] = useState("general");
  const [tune, setTune] = useState<number[]>(Array(9).fill(0));
  const [customSettings, setCustomSettings] = useState(["18", "", "17"]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [providerError, setProviderError] = useState("");
  const [providerInfo, setProviderInfo] = useState<LivePrayerTimes | null>(null);
  const [submitted, setSubmitted] = useState<NightCalculationInput | null>(null);
  const [firstAdhanMinutes, setFirstAdhanMinutes] = useState<number | null>(null);
  const [timelineView, setTimelineView] = useState<"general" | "dawud" | "prophetic">("general");

  const calculation = useMemo(() => {
    if (!submitted) return { result: null, engineResult: null, error: "" };
    try {
      // Validate the display timezone independently from interval arithmetic.
      new Intl.DateTimeFormat("en", { timeZone: submitted.timeZone }).format(0);
      const engineResult = calculateSharedNightSegments(submitted);
      return { result: mapNightSegments(engineResult), engineResult, error: "" };
    } catch (error) {
      return {
        result: null,
        engineResult: null,
        error: error instanceof Error ? error.message : "Calculation failed.",
      };
    }
  }, [submitted]);

  async function loadLivePrayerTimes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoadingLive(true);
    setProviderError("");

    try {
      if (prayerTimeSource === "coordinates") {
        const numericLatitude = Number(latitude);
        const numericLongitude = Number(longitude);
        if (
          !Number.isFinite(numericLatitude) ||
          numericLatitude < -90 ||
          numericLatitude > 90 ||
          !Number.isFinite(numericLongitude) ||
          numericLongitude < -180 ||
          numericLongitude > 180
        ) {
          throw new Error("Enter valid latitude and longitude values.");
        }
        const response = await fetch("/api/v1/night/calculate-from-coordinates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            latitude: numericLatitude,
            longitude: numericLongitude,
            serviceDate,
            timeZone: coordinateTimeZone,
            calculationMethod: method,
          }),
        });
        const body = (await response.json()) as CoordinateCalculationResponse & {
          error?: { message?: string };
        };
        if (!response.ok)
          throw new Error(body.error?.message ?? "Prayer times could not be loaded.");
        setProviderInfo({
          maghrib: body.input.maghrib,
          fajr: body.input.fajr,
          timeZone: body.input.timeZone,
          location: `${numericLatitude.toFixed(5)}, ${numericLongitude.toFixed(5)}`,
          calculationMethod: body.prayerTimes.calculationMethod,
          juristicSchool: "Provider default",
          source: body.prayerTimes.provider,
          serviceDate,
        });
        setSubmitted({ ...body.input, fajrWakeBufferMinutes: fajrBufferMinutes });
        return;
      }
      if (prayerTimeSource === "manual") {
        const date = Temporal.PlainDate.from(serviceDate);
        const maghrib = Temporal.PlainDateTime.from(`${date.toString()}T${manualMaghrib}`)
          .toZonedDateTime(manualTimeZone, { disambiguation: "reject" })
          .toInstant()
          .toString();
        const fajr = Temporal.PlainDateTime.from(
          `${date.add({ days: 1 }).toString()}T${manualFajr}`,
        )
          .toZonedDateTime(manualTimeZone, { disambiguation: "reject" })
          .toInstant()
          .toString();
        const manualTimes: LivePrayerTimes = {
          maghrib,
          fajr,
          timeZone: manualTimeZone,
          location: "Trusted timetable / manual input",
          calculationMethod: "Supplied by user",
          juristicSchool: "Not applicable",
          source: "Manual input",
          serviceDate,
        };
        setProviderInfo(manualTimes);
        setSubmitted({
          maghrib,
          fajr,
          timeZone: manualTimeZone,
          fajrWakeBufferMinutes: fajrBufferMinutes,
        });
        return;
      }
      const parameters = new URLSearchParams({
        city: prayerTimeSource === "london-unified" ? "London" : city,
        country: prayerTimeSource === "london-unified" ? "United Kingdom" : countryCode,
        state,
        method: String(method),
        school: String(school),
        date: serviceDate,
        source: prayerTimeSource,
        latitudeAdjustmentMethod: String(latitudeAdjustmentMethod),
        midnightMode: String(midnightMode),
        shafaq,
        tune: tune.join(","),
      });
      if (method === 99) {
        parameters.set(
          "methodSettings",
          customSettings.map((value) => value.trim() || "null").join(","),
        );
      }
      const response = await fetch(`/api/prayer-times?${parameters}`);
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Live prayer times could not be loaded.");
      }

      const prayerTimes = body as LivePrayerTimes;
      // Provider output is passed unchanged into the existing calculation input.
      setProviderInfo(prayerTimes);
      setSubmitted({
        maghrib: prayerTimes.maghrib,
        fajr: prayerTimes.fajr,
        timeZone: prayerTimes.timeZone,
        fajrWakeBufferMinutes: fajrBufferMinutes,
      });
    } catch (error) {
      setProviderError(
        error instanceof Error ? error.message : "Live prayer times could not be loaded.",
      );
    } finally {
      setLoadingLive(false);
    }
  }

  function usePreciseLocation() {
    setProviderError("");
    if (!navigator.geolocation) {
      setProviderError("This browser does not provide geolocation. Enter coordinates manually.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(String(coords.latitude));
        setLongitude(String(coords.longitude));
        setLocationAccuracy(coords.accuracy);
        const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (browserTimeZone) setCoordinateTimeZone(browserTimeZone);
        setPrayerTimeSource("coordinates");
        setLocating(false);
      },
      (error) => {
        const messages: Record<number, string> = {
          1: "Location permission was denied. Allow location access or enter coordinates manually.",
          2: "Your location is currently unavailable. Try again or enter coordinates manually.",
          3: "Location lookup timed out. Try again or enter coordinates manually.",
        };
        setProviderError(messages[error.code] ?? "Could not obtain your location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }

  function loadFixture(id: string) {
    const fixture = demoPrayerTimes[id];
    if (!fixture) return;
    const maghrib = Temporal.Instant.from(fixture.maghrib).toZonedDateTimeISO(fixture.timeZone);
    const fajr = Temporal.Instant.from(fixture.fajr).toZonedDateTimeISO(fixture.timeZone);
    setServiceDate(maghrib.toPlainDate().toString());
    setManualMaghrib(maghrib.toPlainTime().toString({ smallestUnit: "minute" }));
    setManualFajr(fajr.toPlainTime().toString({ smallestUnit: "minute" }));
    setManualTimeZone(fixture.timeZone);
    setPrayerTimeSource("manual");
    setSubmitted(null);
    setProviderInfo(null);
    setProviderError("");
  }

  const result = calculation.result;
  const engineResult = calculation.engineResult;
  const displayTimeZone = submitted?.timeZone ?? "UTC";

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#07171d] text-[#e4ece9]">
      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_75%_0%,#173d47_0,transparent_35rem)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-14 text-center sm:px-8 sm:py-28">
          <p className="mb-5 text-xs font-bold tracking-[0.24em] text-[#d0ae67]">
            MAGHRIB → FOLLOWING FAJR
          </p>
          <h1 className="mx-auto max-w-full text-center font-serif text-4xl leading-tight tracking-tight sm:max-w-4xl sm:text-7xl sm:leading-[0.95]">
            Prophetic Night Segments
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#9baca7] sm:mt-6 sm:text-lg sm:leading-8">
            One night, shown through its conventional thirds, the Dāwūd prayer pattern, and the
            varied timing of Prophetic qiyam.
          </p>
        </div>
      </header>

      <div className="mx-auto min-w-0 max-w-7xl space-y-12 px-4 py-8 sm:space-y-16 sm:px-8 sm:py-12">
        <section className="min-w-0 border border-white/10 bg-[#0c2229] p-4 shadow-2xl sm:p-10">
          <div className="mb-8">
            <p className="text-xs font-bold tracking-[0.2em] text-[#d0ae67]">01 / CALCULATE</p>
            <h2 className="mt-2 font-serif text-3xl">Set the night interval</h2>
          </div>

          <p className="mb-7 inline-block border border-[#d0ae67]/30 bg-[#d0ae67]/5 px-4 py-2 text-sm font-semibold text-[#d0ae67]">
            {prayerTimeSource === "london-unified"
              ? "Published times · London Unified"
              : prayerTimeSource === "aladhan"
                ? "Live prayer times · AlAdhan"
                : prayerTimeSource === "coordinates"
                  ? "Live prayer times · Precise coordinates"
                  : "Trusted timetable · Manual"}
          </p>

          <form
            onSubmit={loadLivePrayerTimes}
            className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-start"
          >
            <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
              Quick location
              <select
                value={locationId}
                onChange={(event) => {
                  const nextLocation = event.target.value;
                  setLocationId(nextLocation);
                  const location = locations.find((item) => item.id === nextLocation);
                  if (location && location.id !== "custom") {
                    setCountryCode(location.countryCode);
                    setCity(location.city);
                    setState("");
                  }
                  setPrayerTimeSource(nextLocation === "gb-london" ? "london-unified" : "aladhan");
                }}
                className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.id === "custom"
                      ? "Custom worldwide location"
                      : `${location.country} — ${location.city}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
              Service date
              <input
                type="date"
                value={serviceDate}
                onChange={(event) => setServiceDate(event.target.value)}
                className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                required
              />
            </label>
            <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
              Prayer-time source
              <select
                value={prayerTimeSource}
                onChange={(event) =>
                  setPrayerTimeSource(
                    event.target.value as "london-unified" | "aladhan" | "coordinates" | "manual",
                  )
                }
                className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
              >
                {locationId === "gb-london" && (
                  <option value="london-unified">London Unified Prayer Timetable</option>
                )}
                <option value="aladhan">AlAdhan astronomical calculation</option>
                <option value="coordinates">Precise coordinates</option>
                <option value="manual">Trusted timetable / manual times</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
              First Adhan Reminder
              <select
                value={firstAdhanMinutes ?? ""}
                onChange={(event) =>
                  setFirstAdhanMinutes(
                    event.target.value === "" ? null : Number(event.target.value),
                  )
                }
                className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
              >
                <option value="">Off</option>
                {firstAdhanOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minutes before Fajr
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
              Fajr preparation buffer
              <input
                type="number"
                min="0"
                value={fajrBufferMinutes}
                onChange={(event) => setFajrBufferMinutes(Number(event.target.value))}
                className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
              />
              <span className="text-xs text-[#8ea29d]">Minutes before Fajr</span>
            </label>
            {prayerTimeSource === "coordinates" && (
              <>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  Latitude
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="-90"
                    max="90"
                    value={latitude}
                    onChange={(event) => {
                      setLatitude(event.target.value);
                      setLocationAccuracy(null);
                    }}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  Longitude
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="-180"
                    max="180"
                    value={longitude}
                    onChange={(event) => {
                      setLongitude(event.target.value);
                      setLocationAccuracy(null);
                    }}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  IANA timezone
                  <input
                    value={coordinateTimeZone}
                    onChange={(event) => setCoordinateTimeZone(event.target.value)}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
                <button
                  type="button"
                  onClick={usePreciseLocation}
                  disabled={locating}
                  className="w-full border border-[#d0ae67] px-5 py-3 font-semibold text-[#d0ae67] disabled:opacity-60 lg:w-auto"
                >
                  {locating ? "Finding precise location…" : "Use my precise location"}
                </button>
                <p
                  className="text-xs text-[#8ea29d] md:col-span-2 xl:col-span-5"
                  aria-live="polite"
                >
                  {locationAccuracy === null
                    ? "Location permission is optional; decimal coordinates can always be entered manually."
                    : `Location acquired with approximately ${Math.round(locationAccuracy)} m accuracy.`}
                </p>
              </>
            )}
            {prayerTimeSource === "manual" && (
              <>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  Demonstration fixture
                  <select
                    defaultValue=""
                    onChange={(event) => loadFixture(event.target.value)}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                  >
                    <option value="" disabled>
                      Choose demonstration times
                    </option>
                    {Object.entries(demoPrayerTimes).map(([id, fixture]) => (
                      <option key={id} value={id}>
                        {fixture.location}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-[#8ea29d]">
                    Demonstration only—not a live timetable.
                  </span>
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  IANA timezone
                  <input
                    value={manualTimeZone}
                    onChange={(event) => setManualTimeZone(event.target.value)}
                    placeholder="Europe/London"
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  Maghrib
                  <input
                    type="time"
                    step="1"
                    value={manualMaghrib}
                    onChange={(event) => setManualMaghrib(event.target.value)}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  Following Fajr <span className="text-[#8ea29d]">(+1 day)</span>
                  <input
                    type="time"
                    step="1"
                    value={manualFajr}
                    onChange={(event) => setManualFajr(event.target.value)}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
              </>
            )}
            {prayerTimeSource === "aladhan" && (
              <>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  Country or territory
                  <select
                    value={countryCode}
                    onChange={(event) => {
                      setCountryCode(event.target.value);
                      setLocationId("custom");
                    }}
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  >
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  City
                  <input
                    value={city}
                    onChange={(event) => {
                      setCity(event.target.value);
                      setLocationId("custom");
                    }}
                    maxLength={100}
                    autoComplete="address-level2"
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                    required
                  />
                </label>
                <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                  State / province <span className="text-[#8ea29d]">(optional)</span>
                  <input
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                    maxLength={100}
                    autoComplete="address-level1"
                    className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                  />
                </label>
              </>
            )}
            {prayerTimeSource === "aladhan" && (
              <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                Calculation method
                <select
                  value={method}
                  onChange={(event) => setMethod(Number(event.target.value))}
                  className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                >
                  {calculationMethods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {prayerTimeSource === "aladhan" && (
              <details className="md:col-span-2 xl:col-span-5 border border-white/10 bg-[#06151a] p-4">
                <summary className="cursor-pointer font-semibold text-[#d0ae67]">
                  Advanced AlAdhan settings
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="grid gap-2 text-sm text-[#c8d4d0]">
                    High-latitude adjustment
                    <select
                      value={latitudeAdjustmentMethod}
                      onChange={(event) => setLatitudeAdjustmentMethod(Number(event.target.value))}
                      className="border border-white/20 bg-[#0c2229] px-3 py-3"
                    >
                      <option value={1}>Middle of the night</option>
                      <option value={2}>One seventh of the night</option>
                      <option value={3}>Angle based</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-[#c8d4d0]">
                    Midnight mode
                    <select
                      value={midnightMode}
                      onChange={(event) => setMidnightMode(Number(event.target.value))}
                      className="border border-white/20 bg-[#0c2229] px-3 py-3"
                    >
                      <option value={0}>Standard</option>
                      <option value={1}>Jafari</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm text-[#c8d4d0]">
                    Shafaq
                    <select
                      value={shafaq}
                      onChange={(event) => setShafaq(event.target.value)}
                      className="border border-white/20 bg-[#0c2229] px-3 py-3"
                    >
                      <option value="general">General</option>
                      <option value="ahmer">Ahmer</option>
                      <option value="abyad">Abyad</option>
                    </select>
                  </label>
                </div>
                {method === 99 && (
                  <fieldset className="mt-5">
                    <legend className="text-sm font-semibold text-white">
                      Custom method settings
                    </legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {["Fajr angle", "Maghrib angle / minutes", "Isha angle / minutes"].map(
                        (label, index) => (
                          <label key={label} className="grid gap-2 text-xs text-[#c8d4d0]">
                            {label}
                            <input
                              type="number"
                              min={0}
                              max={30}
                              step="0.1"
                              value={customSettings[index]}
                              onChange={(event) => {
                                const next = [...customSettings];
                                next[index] = event.target.value;
                                setCustomSettings(next);
                              }}
                              className="border border-white/20 bg-[#0c2229] px-3 py-2"
                            />
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>
                )}
                <fieldset className="mt-5">
                  <legend className="text-sm font-semibold text-white">Minute tuning</legend>
                  <p className="mt-1 text-xs text-[#8ea29d]">
                    Use only to match a verified local authority timetable.
                  </p>
                  <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                    {[
                      "Imsak",
                      "Fajr",
                      "Sunrise",
                      "Dhuhr",
                      "Asr",
                      "Maghrib",
                      "Sunset",
                      "Isha",
                      "Midnight",
                    ].map((label, index) => (
                      <label key={label} className="grid gap-2 text-xs text-[#c8d4d0]">
                        {label}
                        <input
                          type="number"
                          min={-60}
                          max={60}
                          step={1}
                          value={tune[index]}
                          onChange={(event) => {
                            const next = [...tune];
                            next[index] = Number(event.target.value);
                            setTune(next);
                          }}
                          className="border border-white/20 bg-[#0c2229] px-3 py-2"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
              </details>
            )}
            {prayerTimeSource === "aladhan" && (
              <label className="grid min-w-0 gap-2 text-sm text-[#c8d4d0]">
                Asr juristic method
                <select
                  value={school}
                  onChange={(event) => setSchool(Number(event.target.value))}
                  className="w-full min-w-0 border border-white/20 bg-[#06151a] px-3 py-3 text-white outline-none focus:border-[#d0ae67] sm:px-4"
                >
                  <option value={0}>Standard — Shafi, Maliki, Hanbali</option>
                  <option value={1}>Hanafi</option>
                </select>
              </label>
            )}
            <button
              type="submit"
              disabled={loadingLive}
              className="w-full bg-[#d0ae67] px-5 py-3 font-semibold text-[#102027] transition hover:bg-[#e2c27c] disabled:cursor-wait disabled:opacity-60 lg:w-auto lg:px-8"
            >
              {loadingLive ? "Calculating…" : "Calculate this night"}
            </button>
          </form>
          <p className="mt-4 text-xs leading-5 text-[#8ea29d]">
            {prayerTimeSource === "london-unified"
              ? "Uses the published 2026 London Unified timetable for London within the M25. Standard jurisprudence uses Asr mithl 1. The night is calculated from published Maghrib to the following day’s published Fajr."
              : prayerTimeSource === "aladhan"
                ? "AlAdhan calculates today’s Maghrib and following Fajr astronomically. Choose the method used by your local authority; it is not interchangeable with a mosque-published timetable."
                : prayerTimeSource === "coordinates"
                  ? "The server-side provider sources Maghrib and following Fajr for the supplied coordinates. Verify its calculation method against your local authority."
                  : "Enter Maghrib and the following day’s Fajr exactly as published by a trusted timetable. The engine performs arithmetic only and does not independently choose prayer times."}
          </p>
          {providerInfo && (
            <div className="mt-5 border border-[#d0ae67]/30 bg-[#d0ae67]/5 p-4 text-sm">
              <p className="font-semibold text-[#d0ae67]">{providerInfo.location}</p>
              <p className="mt-2 text-base font-semibold text-white">
                Night of {formatCalendarDate(providerInfo.maghrib, providerInfo.timeZone)}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="border border-white/10 bg-[#06151a] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8ea29d]">
                    Night begins · Maghrib
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#d0ae67]">
                    {formatPrayerTime(providerInfo.maghrib, providerInfo.timeZone)}
                  </p>
                  <p className="mt-1 text-xs text-[#aebcb8]">
                    {formatCalendarDate(providerInfo.maghrib, providerInfo.timeZone)}
                  </p>
                </div>
                <span aria-hidden="true" className="hidden text-[#8ea29d] sm:block">
                  →
                </span>
                <div className="border border-white/10 bg-[#06151a] p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8ea29d]">
                    Night ends · following Fajr
                  </p>
                  <p className="mt-1 text-xl font-semibold text-[#d0ae67]">
                    {formatPrayerTime(providerInfo.fajr, providerInfo.timeZone)}
                  </p>
                  <p className="mt-1 text-xs text-[#aebcb8]">
                    {formatCalendarDate(providerInfo.fajr, providerInfo.timeZone)}
                  </p>
                </div>
              </div>
            </div>
          )}
          {providerError && (
            <p
              role="alert"
              className="mt-6 border-l-2 border-red-400 bg-red-950/30 p-4 text-red-200"
            >
              {providerError}
            </p>
          )}

          {calculation.error && (
            <p
              role="alert"
              className="mt-6 border-l-2 border-red-400 bg-red-950/30 p-4 text-red-200"
            >
              {calculation.error}
            </p>
          )}
        </section>

        {result && (
          <>
            <section aria-labelledby="night-summary">
              <p className="text-xs font-bold tracking-[0.2em] text-[#d0ae67]">02 / NIGHT MAP</p>
              <h2 id="night-summary" className="mt-2 font-serif text-3xl sm:text-4xl">
                One night, three complementary views
              </h2>
              <p className="mt-3 text-[#9baca7]">
                {formatCalendarDate(result.start, displayTimeZone)}
                <span aria-hidden="true"> · </span>
                {formatTime(result.start, displayTimeZone)} →{" "}
                {formatTime(result.end, displayTimeZone)} ·{" "}
                {formatDuration(result.durationMilliseconds)}
              </p>
              {engineResult && submitted && (
                <NightEndTimeline
                  result={engineResult}
                  timeZone={submitted.timeZone}
                  firstAdhanMinutes={firstAdhanMinutes}
                />
              )}
              <div
                className="mt-8 grid overflow-hidden border border-white/15 sm:grid-cols-3"
                role="tablist"
                aria-label="Night timeline interpretation"
              >
                {(
                  [
                    ["general", "General Night Division"],
                    ["dawud", "Dawud عليه السلام Pattern"],
                    ["prophetic", "Prophetic Qiyam"],
                  ] as const
                ).map(([view, label]) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    id={`timeline-tab-${view}`}
                    aria-selected={timelineView === view}
                    aria-controls={`timeline-panel-${view}`}
                    onClick={() => setTimelineView(view)}
                    className={`px-4 py-4 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#d0ae67] ${
                      timelineView === view
                        ? "bg-[#d0ae67] text-[#102027]"
                        : "border-white/10 bg-[#06151a] text-[#c8d4d0] hover:bg-[#0c2229] sm:border-l"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <details className="mt-4 w-fit max-w-full border border-[#d0ae67]/30 bg-[#d0ae67]/5 p-3 text-sm">
                <summary className="cursor-pointer font-semibold text-[#d0ae67]">
                  <span aria-hidden="true">ⓘ </span>About these views
                </summary>
                <p className="mt-3 leading-6 text-[#b9c6c2]">
                  These views describe the same night using different levels of detail. Thirds are
                  the general division. Sixths are used here to clearly visualise the
                  sleep–prayer–sleep pattern of Dawud عليه السلام.
                </p>
              </details>
            </section>

            {timelineView === "general" && (
              <section
                id="timeline-panel-general"
                role="tabpanel"
                aria-labelledby="timeline-tab-general"
              >
                <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">
                  GENERAL NIGHT DIVISION
                </p>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl">
                  Conventional Night Division
                </h2>
                <p className="mt-3 max-w-3xl leading-7 text-[#9baca7]">
                  This is the common way of dividing the night when discussing the first, middle,
                  and last third of the night.
                </p>
                <div className="mt-7 grid min-w-0 gap-3 md:grid-cols-3">
                  {[
                    {
                      label: "First Third",
                      start: result.boundaries[0]!,
                      end: result.boundaries[2]!,
                    },
                    {
                      label: "Middle Third",
                      start: result.boundaries[2]!,
                      end: result.boundaries[4]!,
                    },
                    {
                      label: "Last Third",
                      start: result.boundaries[4]!,
                      end: result.boundaries[6]!,
                    },
                  ].map((third, index) => (
                    <article
                      key={third.label}
                      className={`min-w-0 border p-5 sm:p-6 ${
                        index === 2
                          ? "border-[#d0ae67]/60 bg-[#d0ae67]/10"
                          : "border-white/10 bg-[#0c2229]"
                      }`}
                    >
                      <span className="text-sm text-[#d0ae67]">0{index + 1}</span>
                      <h3 className="mt-3 text-xl font-semibold">{third.label}</h3>
                      <p className="mt-6 text-sm">
                        {formatTime(third.start, displayTimeZone)} →{" "}
                        {formatTime(third.end, displayTimeZone)}
                      </p>
                    </article>
                  ))}
                </div>
                <p className="mt-5 border-l-2 border-[#d0ae67] bg-[#d0ae67]/5 p-4 text-sm">
                  The last third begins at{" "}
                  <strong className="text-[#d0ae67]">
                    {formatTime(result.lastThirdStart, displayTimeZone)}
                  </strong>
                  .
                </p>
              </section>
            )}

            {timelineView === "dawud" && (
              <section
                id="timeline-panel-dawud"
                role="tabpanel"
                aria-labelledby="timeline-tab-dawud"
              >
                <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">
                  DAWUD عليه السلام PRAYER PATTERN
                </p>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl">Dawud عليه السلام Pattern</h2>
                <p className="mt-3 max-w-3xl leading-7 text-[#9baca7]">
                  The night is divided into six equal parts here to illustrate the hadith describing
                  Dawud عليه السلام: he slept half the night, prayed one third, then slept one
                  sixth.
                </p>
                <div className="mt-8 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
                  {result.segments.map((segment) => (
                    <article
                      key={segment.number}
                      className={`flex min-w-0 min-h-64 flex-col border p-5 ${
                        segment.activity === "Prayer"
                          ? "border-[#d0ae67]/60 bg-[#d0ae67]/10"
                          : "border-white/10 bg-[#0c2229]"
                      }`}
                    >
                      <span className="font-serif text-3xl text-[#d0ae67]">0{segment.number}</span>
                      <h3 className="mt-6 text-lg font-semibold">Part {segment.number}</h3>
                      <p className="mt-1 text-sm text-[#a8b8b3]">{segment.activity}</p>
                      <div className="mt-auto pt-8 text-sm">
                        <time className="block">{formatTime(segment.start, displayTimeZone)}</time>
                        <time className="block text-[#9baca7]">
                          → {formatTime(segment.end, displayTimeZone)}
                        </time>
                      </div>
                    </article>
                  ))}
                </div>
                <dl className="mt-6 grid gap-3 md:grid-cols-3">
                  {[
                    ["Sleep · Parts 1–3", result.boundaries[0]!, result.midpoint],
                    ["Pray · Parts 4–5", result.midpoint, result.finalSixthStart],
                    ["Sleep · Part 6", result.finalSixthStart, result.end],
                  ].map(([label, start, end]) => (
                    <div key={label} className="border border-white/10 bg-[#06151a] p-4">
                      <dt className="font-semibold">{label}</dt>
                      <dd className="mt-2 text-sm text-[#d0ae67]">
                        {formatTime(start, displayTimeZone)} → {formatTime(end, displayTimeZone)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-5 text-sm leading-6 text-[#8ea29d]">
                  Reference: Ṣaḥīḥ al-Bukhārī 1131. This is an informational visualisation, not a
                  compulsory practice or religious ruling.
                </p>
              </section>
            )}

            {timelineView === "prophetic" && (
              <section
                id="timeline-panel-prophetic"
                role="tabpanel"
                aria-labelledby="timeline-tab-prophetic"
              >
                <p className="text-xs font-bold tracking-[0.18em] text-[#d0ae67]">
                  PROPHETIC QIYAM
                </p>
                <h2 className="mt-2 font-serif text-3xl sm:text-4xl">Prophetic Qiyam Timeline</h2>
                <p className="mt-3 max-w-3xl leading-7 text-[#9baca7]">
                  The Prophet Muhammad ﷺ prayed at different portions of the night on different
                  occasions. His night prayer was not restricted to one fixed half–third–sixth
                  schedule.
                </p>
                <div className="mt-8 border border-white/10 bg-[#0c2229] p-5 sm:p-8">
                  <div className="flex items-center gap-3" aria-label="Maghrib to Fajr night span">
                    <span className="h-3 w-3 shrink-0 rounded-full bg-[#d0ae67]" />
                    <span className="h-1 flex-1 bg-gradient-to-r from-[#d0ae67] via-[#38606a] to-[#d0ae67]" />
                    <span className="h-3 w-3 shrink-0 rounded-full bg-[#d0ae67]" />
                  </div>
                  <div className="mt-3 flex justify-between gap-4 text-sm">
                    <p>
                      <strong className="block">Maghrib · night begins</strong>
                      {formatTime(result.start, displayTimeZone)}
                    </p>
                    <p className="text-right">
                      <strong className="block">Fajr · night ends</strong>
                      {formatTime(result.end, displayTimeZone)}
                    </p>
                  </div>
                  <p className="mx-auto mt-8 max-w-2xl text-center leading-7 text-[#b9c6c2]">
                    Qiyam occurred within this same night span at varying portions. No fixed
                    six-part formula is imposed on this view.
                  </p>
                </div>
                <p className="mt-5 text-sm text-[#8ea29d]">
                  Reference: Ṣaḥīḥ al-Bukhārī 1146 describes a sleep–prayer–sleep–Fajr sequence
                  without establishing one exact six-part schedule.
                </p>
              </section>
            )}
            {engineResult && submitted && (
              <ScheduleTools
                result={engineResult}
                input={submitted}
                firstAdhanMinutes={firstAdhanMinutes}
              />
            )}
          </>
        )}

        <footer className="border-t border-white/10 py-8 text-sm leading-6 text-[#839792]">
          This informational prototype performs arithmetic on supplied prayer times. It does not
          calculate prayer times, issue fatāwā, or replace qualified religious guidance.
        </footer>
      </div>
    </main>
  );
}
