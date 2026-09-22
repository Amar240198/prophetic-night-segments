import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, readAppUser } from "@/lib/auth/session.server";
import { database } from "@/lib/google-calendar/database.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { validateAnalysis } from "@/lib/miqat/analysis";
import { readSettings } from "@/lib/product/settings.server";
import { parseAutomationConfig } from "@/lib/automation/schedule.server";
import { automationEntitlement } from "@/lib/automation/entitlement.server";
export const runtime = "nodejs";
export async function GET() {
  const user = await readAppUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  const settings = await readSettings(user.id);
  const rows =
    await database()`SELECT revision, enabled, last_error_code FROM miqaat_automation WHERE user_id=${user.id}`;
  return NextResponse.json(
    {
      config: settings.automation,
      state: rows[0] ?? null,
      entitlement: await automationEntitlement(user.id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const user = await readAppUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  try {
    const body = (await readBoundedJson(request)) as {
      config?: unknown;
      revision?: unknown;
      preferencesRevision?: unknown;
      analysis?: unknown;
    };
    const settings = await readSettings(user.id);
    if (!settings.configured)
      return NextResponse.json(
        { error: { message: "Confirm your prayer settings before saving automation." } },
        { status: 409 },
      );
    const config = parseAutomationConfig({
      ...(body.config as object),
      source: settings.prayer.source,
      timezone: settings.prayer.timezone,
    });
    const analysis =
      body.analysis === undefined ? settings.analysis : validateAnalysis(body.analysis);
    if (body.preferencesRevision !== settings.revision)
      return NextResponse.json(
        { error: { message: "Settings changed. Reload before saving." } },
        { status: 409 },
      );
    const rows = await database()`WITH preferences AS (
      UPDATE miqaat_preferences SET prayer_analysis=${JSON.stringify(analysis)}::jsonb,revision=revision+1,updated_at=now()
      WHERE user_id=${user.id} AND revision=${settings.revision} AND (
        (${body.revision ?? null}::bigint IS NULL AND NOT EXISTS(SELECT 1 FROM miqaat_automation WHERE user_id=${user.id})) OR
        EXISTS(SELECT 1 FROM miqaat_automation WHERE user_id=${user.id} AND revision=${body.revision ?? null}::bigint)
      ) RETURNING user_id
    ) INSERT INTO miqaat_automation(user_id,configuration) SELECT user_id,${JSON.stringify(config)}::jsonb FROM preferences
      ON CONFLICT(user_id) DO UPDATE SET configuration=EXCLUDED.configuration, revision=miqaat_automation.revision+1,
      updated_at=now(),next_sync_at=CASE WHEN miqaat_automation.enabled THEN now() ELSE miqaat_automation.next_sync_at END
      RETURNING revision`;
    if (!rows.length)
      return NextResponse.json(
        { error: { message: "Settings changed. Reload before saving." } },
        { status: 409 },
      );
    return GET();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_AUTOMATION",
          message: "Check your location, timezone and schedule settings.",
        },
      },
      { status: 400 },
    );
  }
}
