import { NextRequest } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { requireFeature } from "@/lib/product/entitlements.server";
import { readAppUser } from "@/lib/auth/session.server";
import {
  assertSameOrigin,
  readSession,
  privateResponse,
  errorResponse,
} from "@/lib/google-calendar/session.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { assertCalendarMutationsEnabled } from "@/lib/google-calendar/maintenance.server";
import { bindCalendarAccount } from "@/lib/google-calendar/reconcile.server";
import { database } from "@/lib/google-calendar/database.server";
import {
  generateAutomationSchedule,
  loadAutomation,
  loadAccountRoutines,
} from "@/lib/automation/schedule.server";
import { automationEntitlement } from "@/lib/automation/entitlement.server";
import { runAccountAutomation } from "@/lib/automation/run.server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await readAppUser();
    if (!user) return privateResponse({ error: { code: "UNAUTHENTICATED" } }, 401);
    const body = (await readBoundedJson(request)) as {
      action?: string;
      days?: number;
      tomorrow?: boolean;
      confirm?: boolean;
    };
    if (body.action === "pause") {
      await database()`UPDATE miqaat_automation SET enabled=false,updated_at=now() WHERE user_id=${user.id}`;
      return privateResponse({ paused: true });
    }
    await requireFeature(user.id, "calendar-automation");
    const { config } = await loadAutomation(user.id);
    const now = Temporal.Now.instant();
    if (body.action === "preview") {
      if (![1, 7].includes(body.days ?? 1))
        return privateResponse({ error: { code: "INVALID_REQUEST" } }, 400);
      const date = now
        .toZonedDateTimeISO(config.timezone)
        .toPlainDate()
        .add({ days: body.tomorrow === true ? 1 : 0 })
        .toString();
      return privateResponse(
        await generateAutomationSchedule(
          config,
          await loadAccountRoutines(user.id),
          date,
          body.days ?? 1,
        ),
      );
    }
    if (
      !["sync", "enable", "remove"].includes(body.action ?? "") ||
      (body.action === "remove" && body.confirm !== true)
    )
      return privateResponse({ error: { code: "INVALID_REQUEST" } }, 400);
    assertCalendarMutationsEnabled();
    const session = await readSession(request);
    await bindCalendarAccount(session, user.id);
    if (body.action === "enable") {
      const entitlement = await automationEntitlement(user.id);
      if (!entitlement.allowed)
        return privateResponse(
          {
            error: {
              code: "AUTOMATION_PAUSED",
              message: "Your Miqāt automation is paused. Subscribe to resume.",
            },
          },
          403,
        );
      await database()`UPDATE miqaat_automation SET enabled=true,google_connection_id=${session.connectionId},next_sync_at=now(),updated_at=now() WHERE user_id=${user.id}`;
    }
    return privateResponse(
      await runAccountAutomation(user.id, session, now.toString(), body.action === "remove"),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      ["AUTOMATION_PAUSED", "SCHEDULE_INCOMPLETE", "SYNC_FAILED"].includes(error.message)
    )
      return privateResponse(
        {
          error: {
            code: error.message,
            message: "Automation could not complete. Check your settings and sync status.",
          },
        },
        error.message === "AUTOMATION_PAUSED" ? 403 : 422,
      );
    return errorResponse(error);
  }
}
