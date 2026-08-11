import { calculateNightSegments, validateNightInput } from "@prophetic-night/night-engine";
import type { NightCalculationInput } from "@prophetic-night/night-engine";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Partial<NightCalculationInput>;
    const errors = validateNightInput(input);
    if (errors.length > 0) return NextResponse.json({ error: errors[0] }, { status: 400 });
    return NextResponse.json(calculateNightSegments(input as NightCalculationInput));
  } catch {
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
