"use client";
import { useEffect, useState } from "react";
import { DEFAULT_AUTOMATION, type AutomationConfig } from "@/lib/automation/config";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { Card } from "./ui";
export function AutomationControl() {
  const [config, setConfig] = useState<AutomationConfig>(DEFAULT_AUTOMATION);
  const [revision, setRevision] = useState<number | null>(null);
  const [status, setStatus] = useState<Record<string, unknown>>({});
  const [entitlement, setEntitlement] = useState<Record<string, unknown>>({});
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/account/automation", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sign in to load automation settings.");
        const body = await response.json();
        if (!body.config?.source) throw new Error("Automation settings could not be loaded.");
        if (!active) return;
        setConfig(body.config);
        setRevision(body.state?.revision ?? null);
        setStatus(body.state ?? {});
        setEntitlement(body.entitlement ?? {});
        setLoaded(true);
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save() {
    const response = await fetch("/api/account/automation", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, revision }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? "Settings could not be saved.");
    setRevision(body.state?.revision ?? null);
    setStatus(body.state ?? {});
    setEntitlement(body.entitlement ?? {});
  }
  async function action(action: string, days = 1, tomorrow = false) {
    setBusy(true);
    setMessage("");
    try {
      await save();
      const response = await fetch("/api/google-calendar/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, days, tomorrow, confirm: confirmed }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message ?? body.error?.code ?? "Action failed.");
      if (action === "preview") {
        setEvents(body.events);
        setMessage(
          body.issues?.length
            ? `${body.issues.length} occurrences could not be resolved. Check prayer coverage and personal anchors before syncing.`
            : "Preview calculated from your saved settings. No calendar writes made.",
        );
      } else {
        setMessage(
          action === "pause"
            ? "Automation paused. Existing calendar events are preserved."
            : `${body.outcomes?.filter((o: { action: string }) => o.action !== "BLOCKED").length ?? 0} events processed; ${body.outcomes?.filter((o: { action: string }) => o.action === "BLOCKED").length ?? 0} blocked.`,
        );
        const state = await fetch("/api/account/automation", { cache: "no-store" }).then((r) =>
          r.json(),
        );
        setStatus(state.state ?? {});
        setEntitlement(state.entitlement ?? {});
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  const clock = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: config.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <Card title="Calendar automation">
      <p>Set it once. Miqāt keeps it aligned.</p>
      <p>
        Trial/subscription: {String(entitlement.status ?? "Not started")}.{" "}
        {entitlement.trial_ends_at
          ? `Trial ends ${clock(String(entitlement.trial_ends_at))}.`
          : "Enable automation to start your one-time 7-day trial."}
      </p>
      {entitlement.allowed === false && entitlement.trial_started_at ? (
        <p>Your Miqāt automation is paused. Existing events are preserved.</p>
      ) : null}
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          save()
            .then(() => setMessage("Settings saved."))
            .catch((error: Error) => setMessage(error.message))
            .finally(() => setBusy(false));
        }}
      >
        <fieldset disabled={busy || !loaded}>
          <legend>Schedule settings</legend>
          <label>
            Prayer provider
            <select
              value={config.source.kind}
              onChange={(e) =>
                setConfig({
                  ...config,
                  source:
                    e.target.value === "london-unified"
                      ? { kind: "london-unified" }
                      : {
                          kind: "coordinates",
                          latitude: 51.5074,
                          longitude: -0.1278,
                          timeZone: config.timezone,
                          calculationMethod: 3,
                        },
                })
              }
            >
              <option value="london-unified">Published London Unified timetable</option>
              <option value="coordinates">Coordinates provider</option>
            </select>
          </label>
          {config.source.kind === "coordinates" && (
            <>
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={config.source.latitude}
                  onChange={(e) => {
                    if (config.source.kind === "coordinates")
                      setConfig({
                        ...config,
                        source: { ...config.source, latitude: Number(e.target.value) },
                      });
                  }}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={config.source.longitude}
                  onChange={(e) => {
                    if (config.source.kind === "coordinates")
                      setConfig({
                        ...config,
                        source: { ...config.source, longitude: Number(e.target.value) },
                      });
                  }}
                />
              </label>
              <label>
                Calculation method ID
                <input
                  type="number"
                  min="0"
                  max="99"
                  value={config.source.calculationMethod}
                  onChange={(e) => {
                    if (config.source.kind === "coordinates")
                      setConfig({
                        ...config,
                        source: { ...config.source, calculationMethod: Number(e.target.value) },
                      });
                  }}
                />
              </label>
            </>
          )}
          <label>
            Timezone
            <input
              value={config.timezone}
              onChange={(e) =>
                setConfig({
                  ...config,
                  timezone: e.target.value,
                  ...(config.source.kind === "coordinates"
                    ? { source: { ...config.source, timeZone: e.target.value } }
                    : {}),
                })
              }
            />
          </label>
          <label>
            Calendar
            <select value="primary" disabled>
              <option value="primary">Google primary calendar</option>
            </select>
          </label>
          <label>
            Sync horizon
            <select
              value={config.horizon}
              onChange={(e) =>
                setConfig({
                  ...config,
                  horizon:
                    e.target.value === "continuous"
                      ? "continuous"
                      : (Number(e.target.value) as 30 | 60 | 90),
                })
              }
            >
              {[30, 60, 90].map((days) => (
                <option key={days} value={days}>
                  {days} days
                </option>
              ))}
              <option value="continuous">Continuous (rolling 90 days)</option>
            </select>
          </label>
          <fieldset>
            <legend>Automated modules</legend>
            {(["prayers", "routines", "night", "fasting"] as const).map((module) => (
              <label key={module}>
                <input
                  type="checkbox"
                  checked={config.modules.includes(module)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      modules: e.target.checked
                        ? [...config.modules, module]
                        : config.modules.filter((m) => m !== module),
                    })
                  }
                />
                {module}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={config.removeObsolete}
              onChange={(e) => setConfig({ ...config, removeObsolete: e.target.checked })}
            />
            Remove obsolete owned routine occurrences within the future sync horizon
          </label>
          <fieldset>
            <legend>Personal anchors</legend>
            {(["bedtime", "wake_time", "jumuah"] as const).map((key) => (
              <label key={key}>
                {key === "jumuah" ? "Friday Jumu’ah time" : key.replace("_", " ")}
                <input
                  type="time"
                  value={config.personalAnchors[key] ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      personalAnchors: { ...config.personalAnchors, [key]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Fasting programmes</legend>
            {(["monday", "thursday", "white-days"] as const).map((programme) => (
              <label key={programme}>
                <input
                  type="checkbox"
                  checked={config.fasting.includes(programme)}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      fasting: e.target.checked
                        ? [...config.fasting, programme]
                        : config.fasting.filter((p) => p !== programme),
                    })
                  }
                />
                {programme}
              </label>
            ))}
            <p>White Days use an arithmetic Hijri calendar, not observed moon sighting.</p>
          </fieldset>
          <label>
            Night schedule
            <select
              value={config.night}
              onChange={(e) =>
                setConfig({ ...config, night: e.target.value as AutomationConfig["night"] })
              }
            >
              <option value="boundaries">Midpoint, last third and final sixth</option>
              <option value="dawud">Dāwūd: sleep B0–B3, pray B3–B5, sleep B5–B6</option>
            </select>
          </label>
          <button className="primary-button" type="submit">
            Save settings
          </button>
        </fieldset>
      </form>
      <p>
        Automation: {status.enabled ? "Enabled" : "Paused"}. Last attempt:{" "}
        {status.last_attempted_at ? clock(String(status.last_attempted_at)) : "None"}. Last success:{" "}
        {status.last_success_at ? clock(String(status.last_success_at)) : "None"}.
      </p>
      <p>
        Next scheduled sync:{" "}
        {status.next_sync_at ? clock(String(status.next_sync_at)) : "Not scheduled"}.{" "}
        {status.last_error_code ? `Last error: ${String(status.last_error_code)}` : ""}
      </p>
      <div className="form-actions">
        {[
          ["Today", 1, false],
          ["Tomorrow", 1, true],
          ["7 days", 7, false],
        ].map(([label, days, tomorrow]) => (
          <button
            className="secondary-button"
            key={String(label)}
            disabled={busy || !loaded}
            onClick={() => void action("preview", Number(days), Boolean(tomorrow))}
          >
            Preview {label}
          </button>
        ))}
      </div>
      {events.length > 0 && (
        <>
          <p>
            Preview · Google primary calendar · {events.length} events. Routines must have Calendar
            sync enabled.
          </p>
          <ol className="summary-list">
            {events.map((event) => (
              <li key={`${event.id}/${event.serviceDate}`}>
                <time dateTime={event.start}>{clock(event.start)}</time> · {event.title}
                <p>
                  {event.id.startsWith("routine-")
                    ? "Routine"
                    : event.id.startsWith("prayer-")
                      ? "Prayer"
                      : event.id.startsWith("fasting-")
                        ? "Fasting"
                        : "Night"}{" "}
                  · {event.description}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="form-actions">
        <button
          className="primary-button"
          disabled={busy || !events.length}
          onClick={() => void action("enable")}
        >
          Enable automation / start 7-day trial
        </button>
        <button
          className="secondary-button"
          disabled={busy || !events.length}
          onClick={() => void action("sync")}
        >
          Sync now
        </button>
        <button
          className="secondary-button"
          disabled={busy || !loaded}
          onClick={() => void action("pause")}
        >
          Pause automation
        </button>
      </div>
      <details>
        <summary>Remove managed events</summary>
        <p>
          Remove only verified Miqāt events in the selected modules and upcoming horizon. Manual
          events are untouched. Removed identities will not be recreated; create a new routine for a
          new lifecycle.
        </p>
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I confirm this scoped removal
        </label>
        <button disabled={!confirmed || busy || !loaded} onClick={() => void action("remove")}>
          Remove selected managed events
        </button>
      </details>
      {message && <p role="status">{message}</p>}
    </Card>
  );
}
