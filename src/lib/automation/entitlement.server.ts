import { database } from "@/lib/google-calendar/database.server";
export async function automationEntitlement(userId: string) {
  const rows = await database()`SELECT status, trial_started_at, trial_ends_at,
    (status = 'active' AND provider_subscription_id IS NOT NULL) OR
    (status = 'trial' AND trial_ends_at > now()) AS allowed
    FROM miqaat_entitlements WHERE user_id = ${userId}`;
  return rows[0] ?? { status: "expired", allowed: false };
}
/** Database time and a single conditional update ensure a trial cannot restart. */
export async function startAutomationTrial(userId: string) {
  await database()`UPDATE miqaat_entitlements SET status = 'trial', trial_started_at = now(),
    trial_ends_at = now() + interval '168 hours', updated_at = now()
    WHERE user_id = ${userId} AND trial_started_at IS NULL AND provider_subscription_id IS NULL`;
  return automationEntitlement(userId);
}
