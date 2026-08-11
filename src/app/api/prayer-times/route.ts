import {
  ALADHAN_CALCULATION_METHODS,
  ALADHAN_SCHOOLS,
  AlAdhanCalculationMethod,
  AlAdhanSchool,
  fetchAlAdhanPrayerTimes,
} from "@/lib/providers/aladhan";
import { getLondonUnifiedPrayerTimes } from "@/lib/providers/london-unified";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city")?.trim() ?? "";
  const country = request.nextUrl.searchParams.get("country")?.trim() ?? "";
  const calculationMethod = Number(request.nextUrl.searchParams.get("method") ?? "3");
  const school = Number(request.nextUrl.searchParams.get("school") ?? "0");
  const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const adjustmentValue = request.nextUrl.searchParams.get("adjustment");
  const adjustment = adjustmentValue === null ? undefined : Number(adjustmentValue);
  const source = request.nextUrl.searchParams.get("source") ?? "aladhan";
  const state = request.nextUrl.searchParams.get("state")?.trim() || undefined;
  const latitudeAdjustmentMethodValue = request.nextUrl.searchParams.get("latitudeAdjustmentMethod");
  const latitudeAdjustmentMethod =
    latitudeAdjustmentMethodValue === null ? undefined : Number(latitudeAdjustmentMethodValue);
  const midnightModeValue = request.nextUrl.searchParams.get("midnightMode");
  const midnightMode = midnightModeValue === null ? undefined : Number(midnightModeValue);
  const shafaqValue = request.nextUrl.searchParams.get("shafaq");
  const shafaq =
    shafaqValue === "general" || shafaqValue === "ahmer" || shafaqValue === "abyad"
      ? shafaqValue
      : undefined;
  const tuneValue = request.nextUrl.searchParams.get("tune");
  const tune = tuneValue?.split(",").map(Number);
  const methodSettingsValue = request.nextUrl.searchParams.get("methodSettings");
  const methodSettings = methodSettingsValue?.split(",").map((value) =>
    value === "" || value === "null" ? null : Number(value),
  );

  if (source === "london-unified") {
    if (city !== "London" || country !== "United Kingdom") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_TIMETABLE_LOCATION",
            message: "London Unified is only available for its published London coverage.",
          },
        },
        { status: 400 },
      );
    }
    try {
      const result = getLondonUnifiedPrayerTimes(date);
      return NextResponse.json({
        maghrib: result.maghrib.iso,
        fajr: result.fajr.iso,
        formatted: { maghrib: result.maghrib.formatted, fajr: result.fajr.formatted },
        timeZone: result.timezone,
        location: "London, United Kingdom",
        calculationMethod: result.calculationMethod,
        juristicSchool: result.school,
        source: result.source,
        serviceDate: date,
        dailyPrayerTimes: result.dailyPrayerTimes,
        followingDayPrayerTimes: result.followingDayPrayerTimes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "London Unified timetable failed.";
      return NextResponse.json(
        { error: { code: "INVALID_TIMETABLE_REQUEST", message } },
        { status: 400 },
      );
    }
  }
  if (source !== "aladhan") {
    return NextResponse.json(
      { error: { code: "INVALID_SOURCE", message: "Choose a supported prayer-time source." } },
      { status: 400 },
    );
  }

  if (!city || city.length > 100) {
    return NextResponse.json(
      { error: { code: "INVALID_CITY", message: "Choose a valid city." } },
      { status: 400 },
    );
  }
  if (!country || country.length > 100) {
    return NextResponse.json(
      { error: { code: "INVALID_COUNTRY", message: "Choose a valid country." } },
      { status: 400 },
    );
  }
  if (!(calculationMethod in ALADHAN_CALCULATION_METHODS)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_METHOD",
          message: "Choose a supported AlAdhan calculation method.",
        },
      },
      { status: 400 },
    );
  }
  if (!(school in ALADHAN_SCHOOLS)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_SCHOOL",
          message: "Choose Standard or Hanafi juristic calculation.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await fetchAlAdhanPrayerTimes({
        city,
        country,
        state,
        date,
        calculationMethod: calculationMethod as AlAdhanCalculationMethod,
        school: school as AlAdhanSchool,
        latitudeAdjustmentMethod: latitudeAdjustmentMethod as 1 | 2 | 3 | undefined,
        midnightMode: midnightMode as 0 | 1 | undefined,
        shafaq,
        tune: tune as [number, number, number, number, number, number, number, number, number] | undefined,
        methodSettings: methodSettings as [number | null, number | null, number | null] | undefined,
        adjustment,
      });
    return NextResponse.json({
      maghrib: result.maghrib.iso,
      fajr: result.fajr.iso,
      formatted: { maghrib: result.maghrib.formatted, fajr: result.fajr.formatted },
      timeZone: result.timezone,
      location: `${city}, ${country}`,
      calculationMethod: result.calculationMethod,
      juristicSchool: result.school,
      source: result.source,
      serviceDate: date,
      dailyPrayerTimes: result.dailyPrayerTimes,
      followingDayPrayerTimes: result.followingDayPrayerTimes,
    });
  } catch (error) {
    console.error("AlAdhan provider request failed", error);
    return NextResponse.json(
      {
        error: {
          code: "PRAYER_PROVIDER_UNAVAILABLE",
          message: "Live prayer times could not be loaded from AlAdhan.",
        },
      },
      { status: 502 },
    );
  }
}
