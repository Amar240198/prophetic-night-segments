import { NextResponse } from "next/server";
import { readAppUser } from "@/lib/auth/session.server";
export const runtime = "nodejs";
export async function GET() {
  const user = await readAppUser();
  return NextResponse.json({ user }, { status: 200 });
}
