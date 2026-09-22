import { database } from "@/lib/google-calendar/database.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { featureEntitlements, type ProductFeature } from "./entitlements";
export async function getEntitlements(userId: string) {
  const rows =
    await database()`SELECT *, now() AS checked_at FROM miqaat_entitlements WHERE user_id=${userId}`;
  const row = rows[0];
  const now = new Date((row?.checked_at as string) ?? new Date()).getTime();
  const ends = row?.current_period_end ? new Date(row.current_period_end as string).getTime() : 0;
  const trial = row?.status === "trial" && new Date(row.trial_ends_at as string).getTime() > now;
  const active =
    row?.plan !== "FREE" &&
    !!row?.provider_subscription_id &&
    ((row.status === "active" && ends > now) || (row.status === "trialing" && ends > now));
  const state = { plan: active || trial ? ("PRO" as const) : ("FREE" as const), active: true };
  return {
    ...state,
    features: featureEntitlements(state),
    subscription: {
      status: String(row?.status ?? "expired"),
      currentPeriodEnd: row?.current_period_end ?? null,
      cancelAtPeriodEnd: row?.cancel_at_period_end === true,
      customer: !!row?.provider_customer_id,
    },
    legacyTrial: trial,
  };
}
export async function requireFeature(userId: string, feature: ProductFeature) {
  const entitlement = await getEntitlements(userId);
  if (!entitlement.features[feature]) throw new GoogleCalendarError("PRO_REQUIRED", 403);
  return entitlement;
}
