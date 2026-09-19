import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, readAppUser } from "@/lib/auth/session.server";
import { database } from "@/lib/google-calendar/database.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { loadAutomation, parseAutomationConfig } from "@/lib/automation/schedule.server";
import { automationEntitlement } from "@/lib/automation/entitlement.server";
export const runtime = "nodejs";
export async function GET() {
  const user = await readAppUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  return NextResponse.json(
    { ...(await loadAutomation(user.id)), entitlement: await automationEntitlement(user.id) },
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
    const body = (await readBoundedJson(request)) as { config?: unknown; revision?: unknown };
    const config = parseAutomationConfig(body.config);
    const rows =
      await database()`INSERT INTO miqaat_automation (user_id,configuration) SELECT ${user.id},${JSON.stringify(config)}::jsonb
      WHERE ${body.revision ?? null}::bigint IS NULL
      ON CONFLICT (user_id) DO NOTHING RETURNING revision`;
    if (!rows.length) {
      const updated =
        await database()`UPDATE miqaat_automation SET configuration=${JSON.stringify(config)}::jsonb,
        revision=revision+1, updated_at=now(), next_sync_at=CASE WHEN enabled THEN now() ELSE next_sync_at END
        WHERE user_id=${user.id} AND revision=${body.revision ?? null}::bigint RETURNING revision`;
      if (!updated.length)
        return NextResponse.json(
          { error: { code: "SETTINGS_CHANGED", message: "Reload settings before saving." } },
          { status: 409 },
        );
    }
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
