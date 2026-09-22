"use client";
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
        <legend>Prayers</legend>
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
          Protect daily prayers
        </label>
        <label>
          Protection mode
          <select
            value={preferences.protectionMode}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                protectionMode: e.target.value as AnalysisPreferences["protectionMode"],
              })
            }
          >
            <option value="OFF">Off</option>
            <option value="SUGGEST_ONLY">Recommendations only</option>
            <option value="CREATE_CALENDAR_BLOCK">Add calendar blocks</option>
          </select>
        </label>
        {(["minimumRequiredMinutes", "bufferBefore", "bufferAfter"] as const).map((key, i) => (
          <label key={key}>
            {
              [
                "Prayer duration (minutes)",
                "Buffer before meetings (minutes)",
                "Buffer after meetings (minutes)",
              ][i]
            }
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
          Include daily prayer reminders in my managed calendar
        </label>
      </fieldset>
      <fieldset>
        <legend>Night worship</legend>
        <label>
          <input
            type="checkbox"
            checked={config.modules.includes("night")}
            onChange={(e) => module("night", e.target.checked)}
          />
          Qiyām
        </label>
        <label>
          Preferred window
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
            <option value="last-third">Last third</option>
            <option value="final-sixth">Final sixth</option>
            <option value="dawud">Dāwūd night pattern · Parts 4–5</option>
          </select>
        </label>
        <p>Parts 5–6 form the last third. The Dāwūd prayer period is Parts 4–5.</p>
      </fieldset>
      <fieldset>
        <legend>Fasting</legend>
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
            {label}
          </label>
        ))}
        {config.fasting.includes("dawud") && (
          <>
            <label>
              First fasting date
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
              The alternating-day pattern starts on this date. Check lunar dates with your local
              authority.
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
            Import fasting choices from this device
          </button>
        )}
      </fieldset>
      <fieldset>
        <legend>Routines and reminders</legend>
        <label>
          <input
            type="checkbox"
            checked={config.modules.includes("routines")}
            onChange={(e) => module("routines", e.target.checked)}
          />
          Include my enabled worship routines
        </label>
        <p>
          Calendar reminders follow your calendar settings. Miqāt does not send push or SMS
          notifications.
        </p>
      </fieldset>
      <p>
        Prayer location and destination calendar are configured in{" "}
        <Link href="/app/settings">Settings</Link>.
      </p>
      {message && <p role="status">{message}</p>}
      <button className="primary-button" disabled={busy}>
        Save automation preferences
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
      {error && <p role="alert">{error}</p>}
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
            <p>{enabled ? "Automatic updates are enabled." : "Automatic updates are paused."}</p>
            <p>
              Calendar management is currently unavailable. Your preferences can be saved and
              recommendations remain available with Pro.
            </p>
            <p>
              Destination: <Link href="/app/settings#calendar">Manage in Settings</Link>
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
              Keep Miqāt-owned blocks automatically updated
            </label>
            {message && <p role="status">{message}</p>}
          </Card>
        </>
      ) : (
        <p role="status">Loading automation preferences…</p>
      )}
    </>
  );
}
