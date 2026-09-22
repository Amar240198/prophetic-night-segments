/** One launch display definition. Checkout always uses the verified Stripe Price. */
export const PRO_PLAN = {
  name: "Miqāt Pro",
  currency: "gbp",
  monthlyAmount: 499,
  interval: "month",
} as const;
export function formatPlanPrice(
  amount: number = PRO_PLAN.monthlyAmount,
  currency: string = PRO_PLAN.currency,
) {
  return `${new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100)}/month`;
}
export const PRO_BENEFITS = [
  "See Salah alongside your real schedule",
  "Find conflicts and usable prayer windows",
  "Understand recommended prayer times",
  "Preview protected prayer blocks",
  "Keep worship routines aligned with your calendar",
];
