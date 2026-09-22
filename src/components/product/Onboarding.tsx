"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProduct, productApi } from "./ProductContext";
import { PrayerSettings } from "./PrayerSettings";
import { CalendarSettings } from "./CalendarSettings";
import { AutomationEditor } from "./AutomationsPage";
import { BillingButton } from "./BillingButton";
import { formatPlanPrice, PRO_BENEFITS } from "@/lib/billing/plans";
import { PageHeader, Card } from "../app/ui";
export function Onboarding() {
  const { state, save, refresh, error } = useProduct();
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!state) return <p role="status">{error || "Loading your setup…"}</p>;
  const step = state.settings.onboarding;
  async function advance(patch: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage("");
    try {
      await save({ ...patch, advance: true });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Let’s configure Miqāt"
        description="Your progress is saved. Existing connections and settings stay yours."
      />
      <p role="status">
        {step === "complete"
          ? "Setup complete"
          : `Step ${["welcome", "prayer", "plan", "calendar", "selection", "automation"].indexOf(step) + 1} of ${state.entitlements.plan === "PRO" ? 6 : 3}`}
      </p>
      {state.settings.sourceReviewRequired && (
        <p role="status">
          Your previous timetable is no longer supported. Automation is paused until you review and
          save replacement prayer settings. Existing calendar events are unchanged.
        </p>
      )}
      <Card
        title={
          {
            welcome: "Welcome",
            prayer: "Prayer settings",
            plan: "Choose your plan",
            calendar: "Connect your calendar",
            selection: "Choose calendars",
            automation: "Your worship preferences",
            complete: "Your Miqāt is ready",
          }[step]
        }
      >
        {step === "welcome" && (
          <>
            <p>Miqāt helps you see Salah alongside the day you already have.</p>
            <button disabled={busy} onClick={() => void advance()}>
              Continue
            </button>
          </>
        )}
        {step === "prayer" && (
          <PrayerSettings
            initial={state.settings.prayer}
            onSave={(prayer) => advance({ prayer })}
            buttonLabel="Save and continue"
          />
        )}
        {step === "plan" && (
          <>
            <h3>Free</h3>
            <p>Prayer times, night calculations and the detailed Sixth of the Night calculator.</p>
            <button disabled={busy} onClick={() => void advance()}>
              {state.entitlements.plan === "PRO" ? "Continue with Pro" : "Continue Free"}
            </button>
            <h3>Miqāt Pro · {formatPlanPrice()}</h3>
            <ul>
              {PRO_BENEFITS.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            {state.entitlements.plan !== "PRO" && (
              <BillingButton>Upgrade to Miqāt Pro</BillingButton>
            )}
            <p>
              Calendar management is currently unavailable. Pro calendar analysis and
              recommendations can be used with read access.
            </p>
          </>
        )}
        {(step === "calendar" || step === "selection") && (
          <>
            <CalendarSettings />
            <button disabled={busy} onClick={() => void advance()}>
              Continue
            </button>
            <p>You can connect later from Settings.</p>
          </>
        )}
        {step === "automation" && (
          <AutomationEditor
            initial={state.settings.automation}
            analysis={state.settings.analysis}
            onSave={async (config, analysis) => {
              const existing = await productApi<{ state: { revision: number } | null }>(
                "/api/account/automation",
              );
              await productApi("/api/account/automation", {
                config,
                analysis,
                preferencesRevision: state.settings.revision,
                revision: existing.state?.revision ?? null,
              });
              await refresh();
              setMessage("Preferences saved. Continue when ready.");
            }}
          />
        )}
        {step === "automation" && (
          <button disabled={busy} onClick={() => void advance()}>
            Continue
          </button>
        )}
        {step === "complete" && (
          <button
            className="primary-button"
            onClick={() => {
              router.push("/app");
              router.refresh();
            }}
          >
            Open Today
          </button>
        )}
        {message && <p role="alert">{message}</p>}
      </Card>
      <Link href="/app/settings">Review existing settings</Link>
    </>
  );
}
