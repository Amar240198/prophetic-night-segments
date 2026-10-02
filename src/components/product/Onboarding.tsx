"use client";
import { T } from "@/components/i18n/LocaleProvider";
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
  if (!state)
    return (
      <p role="status">
        <T>{error || "Loading your setup…"}</T>
      </p>
    );
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
        <T
          values={{
            step:
              ["welcome", "prayer", "plan", "calendar", "selection", "automation"].indexOf(step) +
              1,
            total: state.entitlements.plan === "PRO" ? 6 : 3,
          }}
        >
          {step === "complete" ? "Setup complete" : "Step {step} of {total}"}
        </T>
      </p>
      {state.settings.sourceReviewRequired && (
        <p role="status">
          <T>
            {
              "Your previous timetable is no longer supported. Automation is paused until you review and save replacement prayer settings. Existing calendar events are unchanged."
            }
          </T>
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
            <p>
              <T>{"Miqāt helps you see Salah alongside the day you already have."}</T>
            </p>
            <button disabled={busy} onClick={() => void advance()}>
              <T>{"Continue"}</T>
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
            <h3>
              <T>{"Free"}</T>
            </h3>
            <p>
              <T>
                {"Prayer times, night calculations and the detailed Sixth of the Night calculator."}
              </T>
            </p>
            <button disabled={busy} onClick={() => void advance()}>
              <T>{state.entitlements.plan === "PRO" ? "Continue with Pro" : "Continue Free"}</T>
            </button>
            <h3>
              <T>{"Miqāt Pro · "}</T>
              {formatPlanPrice()}
            </h3>
            <ul>
              {PRO_BENEFITS.map((x) => (
                <li key={x}>
                  <T>{x}</T>
                </li>
              ))}
            </ul>
            {state.entitlements.plan !== "PRO" && (
              <BillingButton>
                <T>{"Upgrade to Miqāt Pro"}</T>
              </BillingButton>
            )}
            <p>
              <T>
                {
                  "Calendar management is currently unavailable. Pro calendar analysis and recommendations can be used with read access."
                }
              </T>
            </p>
          </>
        )}
        {(step === "calendar" || step === "selection") && (
          <>
            <CalendarSettings />
            <button disabled={busy} onClick={() => void advance()}>
              <T>{"Continue"}</T>
            </button>
            <p>
              <T>{"You can connect later from Settings."}</T>
            </p>
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
            <T>{"Continue"}</T>
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
            <T>{"Open Today"}</T>
          </button>
        )}
        {message && (
          <p role="alert">
            <T>{message}</T>
          </p>
        )}
      </Card>
      <Link href="/app/settings">
        <T>{"Review existing settings"}</T>
      </Link>
    </>
  );
}
