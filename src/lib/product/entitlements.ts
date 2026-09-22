export type Plan = "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";

export interface EntitlementState {
  plan: Plan;
  active: boolean;
}

export function normalizeEntitlement(value: unknown): EntitlementState {
  if (!value || typeof value !== "object") return { plan: "FREE", active: true };
  const input = value as { plan?: unknown; active?: unknown };
  const plan = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"].includes(String(input.plan))
    ? (input.plan as Plan)
    : "FREE";
  return { plan, active: input.active !== false };
}

export function hasEntitlement(state: EntitlementState, required: Exclude<Plan, "FREE">): boolean {
  if (!state.active) return false;
  const rank: Record<Plan, number> = { FREE: 0, PRO: 1, BUSINESS: 2, ENTERPRISE: 3 };
  return rank[state.plan] >= rank[required];
}

export type ProductFeature =
  | "prayer-times"
  | "night-segments"
  | "calendar-read"
  | "conflict-analysis"
  | "recommendations"
  | "protected-blocks"
  | "calendar-automation"
  | "multiple-calendars"
  | "manual-export"
  | "calendar-write"
  | "advanced-routines";
/** Prices and payment providers are deliberately absent from product capability decisions. */
export function featureEntitlements(
  state: EntitlementState,
  options: { trialActive?: boolean; readOnlyRollout?: boolean } = {},
): Record<ProductFeature, boolean> {
  const pro = hasEntitlement(state, "PRO") || options.trialActive === true;
  const read = pro || options.readOnlyRollout === true;
  return {
    "prayer-times": true,
    "night-segments": true,
    "calendar-read": read,
    "conflict-analysis": read,
    recommendations: read,
    "protected-blocks": pro,
    "calendar-automation": pro,
    "multiple-calendars": read,
    "manual-export": true,
    "calendar-write": pro,
    "advanced-routines": pro,
  };
}
