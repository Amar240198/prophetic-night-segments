import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/google-calendar/database.server";
import { assertSameOrigin, readAppUser } from "@/lib/auth/session.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { readSettings, validatePrayer } from "@/lib/product/settings.server";
import { getEntitlements } from "@/lib/product/entitlements.server";
import { nextOnboardingStep } from "@/lib/product/settings";
import { validateAnalysis } from "@/lib/miqat/analysis";
export const runtime = "nodejs";
export async function GET() {
  const user = await readAppUser();
  if (!user)
    return NextResponse.json({ error: { message: "Sign in is required." } }, { status: 401 });
  const [settings, entitlements] = await Promise.all([
    readSettings(user.id),
    getEntitlements(user.id),
  ]);
  return NextResponse.json(
    { settings, entitlements, user: { id: user.id, email: user.email } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: { message: "Request could not be verified." } },
      { status: 403 },
    );
  }
  const user = await readAppUser();
  if (!user)
    return NextResponse.json({ error: { message: "Sign in is required." } }, { status: 401 });
  try {
    const body = (await readBoundedJson(request)) as Record<string, unknown>;
    const current = await readSettings(user.id);
    if (body.revision !== current.revision)
      return NextResponse.json(
        { error: { message: "Settings changed in another window. Reload before saving." } },
        { status: 409 },
      );
    const prayer = body.prayer === undefined ? current.prayer : validatePrayer(body.prayer);
    const analysis =
      body.analysis === undefined ? current.analysis : validateAnalysis(body.analysis);
    let step = current.onboarding;
    if (body.advance === true) {
      if (step === "prayer" && !current.configured && !body.prayer) throw new Error();
      const pro = (await getEntitlements(user.id)).plan === "PRO";
      if (["calendar", "selection", "automation"].includes(step) && !pro) step = "complete";
      else step = nextOnboardingStep(step, pro);
    }
    const rows =
      await database()`UPDATE miqaat_preferences SET prayer_configuration=CASE WHEN ${body.prayer !== undefined} THEN ${JSON.stringify(prayer)}::jsonb ELSE prayer_configuration END,
      prayer_source=CASE WHEN ${body.prayer !== undefined} THEN ${prayer.source.kind} ELSE prayer_source END, prayer_analysis=${JSON.stringify(analysis)}::jsonb,
      onboarding_step=${step}, revision=revision+1, updated_at=now()
      WHERE user_id=${user.id} AND revision=${current.revision} RETURNING user_id`;
    if (!rows.length)
      return NextResponse.json(
        { error: { message: "Settings changed. Reload before saving." } },
        { status: 409 },
      );
    return GET();
  } catch {
    return NextResponse.json(
      { error: { message: "Check your settings and try again." } },
      { status: 400 },
    );
  }
}
