import { NextRequest, NextResponse } from "next/server";
import { readAppUserFromRequest } from "@/lib/auth/session.server";
import { getEntitlements } from "@/lib/product/entitlements.server";
export async function GET(request: NextRequest) {
  const user = await readAppUserFromRequest(request);
  if (!user)
    return NextResponse.json({ error: { message: "Sign in is required." } }, { status: 401 });
  return NextResponse.json(await getEntitlements(user.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
