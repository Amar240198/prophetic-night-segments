import { NextRequest } from "next/server";
import { billingAction } from "@/lib/billing/http.server";
import { createPortal } from "@/lib/billing/service.server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return billingAction(request, (user) => createPortal(user.id));
}
