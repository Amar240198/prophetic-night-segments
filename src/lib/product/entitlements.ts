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
