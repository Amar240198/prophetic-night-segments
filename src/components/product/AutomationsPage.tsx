"use client";
import { T } from "@/components/i18n/LocaleProvider";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useProduct, productApi } from "./ProductContext";
import type { AutomationConfig } from "@/lib/automation/config";
import type { AnalysisPreferences } from "@/lib/miqat/model";
import { PageHeader, Card } from "../app/ui";
import { RoutinesCard } from "../RoutinesCard";
import { Paywall } from "./Paywall";
export function AutomationEditor({
  initial,
  analysis,
  onSave,
}: {
  initial: AutomationConfig;
  analysis: AnalysisPreferences;
  onSave: (config: AutomationConfig, analysis: AnalysisPreferences) => Promise<void>;
}) {
  const [config, setConfig] = useState(initial),
    [preferences, setPreferences] = useState(analysis),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [legacy, setLegacy] = useState<string | null>(null);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Read optional device preferences after hydration.
      setLegacy(localStorage.getItem("miqat.fasting.v1"));
    } catch {
      /* Device storage is optional. */
    }
  }, []);
  function module(name: AutomationConfig["modules"][number], enabled: boolean) {
    setConfig({
      ...config,
      modules: enabled
        ? [...new Set([...config.modules, name])]
        : config.modules.filter((x) => x !== name),
    });
  }
  return (
    <form
      className="product-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave({ ...config, horizon: 30 }, preferences);
          setMessage("Automation preferences saved.");
        } catch (e) {
          setMessage((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy}>
        <legend>
          <T>{"Prayers"}</T>
        </legend>
        <label>
          <input
            type="checkbox"
            checked={preferences.protectionMode !== "OFF"}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                protectionMode: e.target.checked ? "SUGGEST_ONLY" : "OFF",
              })
            }
          />
          <T>{"Protect daily prayers"}</T>
        </label>
        <label>
          <T>{"Protection mode"}</T>
          <select
            value={preferences.protectionMode}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                protectionMode: e.target.value as AnalysisPreferences["protectionMode"],
              })
            }
          >
            <option value="OFF">
              <T>{"Off"}</T>
            </option>
            <option value="SUGGEST_ONLY">
              <T>{"Recommendations only"}</T>
            </option>
            <option value="CREATE_CALENDAR_BLOCK">
              <T>{"Add calendar blocks"}</T>
            </option>
          </select>
        </label>
        {(["minimumRequiredMinutes", "bufferBefore", "bufferAfter"] as const).map((key, i) => (
          <label key={key}>
            <T>
              {
                [
                  "Prayer duration (minutes)",
                  "Buffer before meetings (minutes)",
                  "Buffer after meetings (minutes)",
                ][i]
              }
            </T>
            <input
              type="number"
              min={i ? 0 : 1}
              max={i ? 60 : 120}
              required
              value={preferences[key]}
              onChange={(e) => setPreferences({ ...preferences, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label>
          <input
            type="checkbox"
            checked={config.modules.includes("prayers")}
            onChange={(e) => module("prayers", e.target.checked)}
          />
          <T>{"Include daily prayer reminders in my managed calendar"}</T>
        </label>
      </fieldset>
      <fieldset>
        <legend>
          <T>{"Night worship"}</T>
        </legend>
        <label>
          <input
            type="checkbox"
            checked={config.modules.includes("night")}
            onChange={(e) => module("night", e.target.checked)}
          />
          <T>{"Qiyām"}</T>
        </label>
        <label>
          <T>{"Preferred window"}</T>
          <select
            value={config.night === "dawud" ? "dawud" : (config.qiyamWindow ?? "last-third")}
            onChange={(e) =>
              setConfig({
                ...config,
                night: e.target.value === "dawud" ? "dawud" : "boundaries",
                qiyamWindow: e.target.value === "final-sixth" ? "final-sixth" : "last-third",
              })
            }
          >
            <option value="last-third">
              <T>{"Last third"}</T>
            </option>
            <option value="final-sixth">
              <T>{"Final sixth"}</T>
            </option>
            <option value="dawud">
              <T>{"Dāwūd night pattern · Parts 4–5"}</T>
            </option>
          </select>
        </label>
        <p>
          <T>{"Parts 5–6 form the last third. The Dāwūd prayer period is Parts 4–5."}</T>
        </p>
      </fieldset>
      <fieldset>
        <legend>
          <T>{"Fasting"}</T>
        </legend>
        {(
          [
            ["monday", "Mondays"],
            ["thursday", "Thursdays"],
            ["white-days", "White Days"],
            ["dawud", "Dāwūd fasting"],
          ] as const
        ).map(([id, label]) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={config.fasting.includes(id)}
              onChange={(e) =>
                setConfig({
                  ...config,
                  fasting: e.target.checked
                    ? [...config.fasting, id]
                    : config.fasting.filter((x) => x !== id),
                  modules: e.target.checked
                    ? [...new Set([...config.modules, "fasting" as const])]
                    : config.modules,
                })
              }
            />
            <T>{label}</T>
          </label>
        ))}
        {config.fasting.includes("dawud") && (
          <>
            <label>
              <T>{"First fasting date"}</T>
              <input
                required
                type="date"
                value={config.fastingAnchor?.date ?? ""}
                onChange={(e) =>
                  setConfig({ ...config, fastingAnchor: { date: e.target.value, fasting: true } })
                }
              />
            </label>
            <p>
              <T>
                {
                  "The alternating-day pattern starts on this date. Check lunar dates with your local authority."
                }
              </T>
            </p>
          </>
        )}
        {legacy && (
          <button
            type="button"
            onClick={() => {
              try {
                const old = JSON.parse(legacy);
                const choices = old.selected.filter((v: string) =>
                  ["monday", "thursday", "white-days", "dawud"].includes(v),
                );
                setConfig({
                  ...config,
                  fasting: choices,
                  fastingAnchor: { date: old.anchorDate, fasting: old.anchorFasting },
                });
                setMessage(
                  "Previous device fasting choices loaded. Save to keep them in your account.",
                );
              } catch {
                setMessage("These device preferences could not be imported.");
              }
            }}
          >
            <T>{"Import fasting choices from this device"}</T>
          </button>
        )}
      </fieldset>
      <fieldset>
        <legend>
          <T>{"Routines and reminders"}</T>
        </legend>
        <label>
          <input
            type="checkbox"
            checked={config.modules.includes("routines")}
            onChange={(e) => module("routines", e.target.checked)}
          />
          <T>{"Include my enabled worship routines"}</T>
        </label>
        <p>
          <T>
            {
              "Calendar reminders follow your calendar settings. Miqāt does not send push or SMS notifications."
            }
          </T>
        </p>
      </fieldset>
      <p>
        <T>{"Prayer location and destination calendar are configured in"}</T>{" "}
        <Link href="/app/settings">
          <T>{"Settings"}</T>
        </Link>
        .
      </p>
      {message && (
        <p role="status">
          <T>{message}</T>
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        <T>{"Save automation preferences"}</T>
      </button>
    </form>
  );
}
export function AutomationsPage() {
  const { state, error, refresh } = useProduct();
  const [revision, setRevision] = useState<number | null>(null),
    [enabled, setEnabled] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void productApi<{ state: { revision: number; enabled: boolean } | null }>(
      "/api/account/automation",
    )
      .then((v) => {
        setRevision(v.state?.revision ?? null);
        setEnabled(v.state?.enabled ?? false);
      })
      .catch(() =>
        setMessage("Automation status could not be loaded. Save settings before enabling."),
      );
  }, []);
  async function persist(config: AutomationConfig, analysis: AnalysisPreferences) {
    const value = await productApi<{ state: { revision: number } }>("/api/account/automation", {
      config,
      analysis,
      preferencesRevision: state?.settings.revision,
      revision,
    });
    setRevision(value.state.revision);
    await refresh();
  }
  return (
    <>
      <PageHeader title="Automations" description="One place to decide what Miqāt helps manage." />
      {error && (
        <p role="alert">
          <T>{error}</T>
        </p>
      )}
      {state ? (
        <>
          <Card title="Your worship preferences">
            <AutomationEditor
              initial={state.settings.automation}
              analysis={state.settings.analysis}
              onSave={persist}
            />
          </Card>
          {state.entitlements.features["advanced-routines"] ? (
            <Card title="Worship routines">
              <RoutinesCard />
            </Card>
          ) : (
            <Paywall title="Advanced routines" />
          )}
          <Card title="Calendar automation">
            <p>
              <T>{enabled ? "Automatic updates are enabled." : "Automatic updates are paused."}</T>
            </p>
            <p>
              <T>
                {
                  "Calendar management is currently unavailable. Your preferences can be saved and recommendations remain available with Pro."
                }
              </T>
            </p>
            <p>
              <T>{"Destination: "}</T>
              <Link href="/app/settings#calendar">
                <T>{"Manage in Settings"}</T>
              </Link>
            </p>
            <label>
              <input
                type="checkbox"
                checked={enabled}
                disabled={!enabled || busy}
                onChange={async () => {
                  setBusy(true);
                  try {
                    await productApi(
                      "/api/google-calendar/automation",
                      { action: "pause" },
                      "POST",
                    );
                    setEnabled(false);
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <T>{"Keep Miqāt-owned blocks automatically updated"}</T>
            </label>
            {message && (
              <p role="status">
                <T>{message}</T>
              </p>
            )}
          </Card>
        </>
      ) : (
        <p role="status">
          <T>{"Loading automation preferences…"}</T>
        </p>
      )}
    </>
  );
}
