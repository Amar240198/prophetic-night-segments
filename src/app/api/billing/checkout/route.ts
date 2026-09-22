import { NextRequest } from "next/server";
import { billingAction } from "@/lib/billing/http.server";
import { createCheckout } from "@/lib/billing/service.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return billingAction(request, (user) => createCheckout(user));
}
