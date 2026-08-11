export {
  calculateDawudPattern,
  calculateLastThird,
  calculateNightSegments,
  createAlarmPlan,
  formatInstant,
  formatNightResult,
  validateNightInput,
} from "@prophetic-night/night-engine";
export type * from "@prophetic-night/shared-types";

export class PropheticNightSegmentsClient {
  constructor(private readonly baseUrl: string) {}

  async calculate(input: NightCalculationInput) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/v1/night/calculate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(`Calculation failed with HTTP ${response.status}`);
    return (await response.json()) as NightCalculationResult;
  }

  async calculateFromCoordinates(input: CoordinateNightCalculationInput) {
    const response = await fetch(
      `${this.baseUrl.replace(/\/$/, "")}/api/v1/night/calculate-from-coordinates`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(`Coordinate calculation failed with HTTP ${response.status}`);
    return (await response.json()) as CoordinateNightCalculationResult;
  }
}
import type {
  CoordinateNightCalculationInput,
  CoordinateNightCalculationResult,
  NightCalculationInput,
  NightCalculationResult,
} from "@prophetic-night/shared-types";
