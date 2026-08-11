import { calculateNightSegments, validateNightInput } from "@prophetic-night/night-engine";
import type {
  CoordinateNightCalculationInput,
  NightCalculationInput,
} from "@prophetic-night/night-engine";
import {
  IslamicAppPrayerTimeProvider,
  PrayerProviderError,
} from "@prophetic-night/prayer-providers";
import { NextResponse } from "next/server";

const provider = new IslamicAppPrayerTimeProvider();

function validInput(
  input: Partial<CoordinateNightCalculationInput>,
): input is CoordinateNightCalculationInput {
  return (
    Number.isFinite(input.latitude) &&
    input.latitude! >= -90 &&
    input.latitude! <= 90 &&
    Number.isFinite(input.longitude) &&
    input.longitude! >= -180 &&
    input.longitude! <= 180 &&
    typeof input.serviceDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(input.serviceDate) &&
    typeof input.timeZone === "string" &&
    input.timeZone.length <= 100
  );
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<CoordinateNightCalculationInput>;
    if (!validInput(input)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Coordinates, service date, or timezone are invalid.",
            details: {},
          },
        },
        { status: 400 },
      );
    }
    const prayerTimes = await provider.getPrayerTimes(input);
    const calculationInput: NightCalculationInput = {
      maghrib: prayerTimes.maghrib,
      fajr: prayerTimes.fajr,
      timeZone: prayerTimes.timeZone,
    };
    const errors = validateNightInput(calculationInput);
    if (errors.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_PROVIDER_RESPONSE",
            message: "Prayer-time provider returned an unusable interval.",
            details: {},
          },
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ...calculateNightSegments(calculationInput),
      prayerTimes: {
        provider: prayerTimes.source,
        calculationMethod: prayerTimes.calculationMethod,
        timeZone: prayerTimes.timeZone,
        dailyPrayerTimes: prayerTimes.dailyPrayerTimes,
      },
    });
  } catch (error) {
    if (error instanceof PrayerProviderError) {
      const status =
        error.code === "INVALID_PROVIDER_INPUT"
          ? 400
          : error.code === "PROVIDER_UNAVAILABLE"
            ? 503
            : 502;
      return NextResponse.json(
        { error: { code: error.code, message: error.message, details: {} } },
        { status },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "Request body must be valid JSON.",
          details: {},
        },
      },
      { status: 400 },
    );
  }
}
