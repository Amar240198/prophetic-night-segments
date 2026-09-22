import { getEntitlements } from "@/lib/product/entitlements.server";
export async function automationEntitlement(userId: string) {
  const value = await getEntitlements(userId);
  return { status: value.subscription.status, allowed: value.features["calendar-automation"] };
}
/** Legacy API retained without granting any new trial. */
export async function startAutomationTrial(userId: string) {
  return automationEntitlement(userId);
}
