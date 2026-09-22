"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Card } from "./ui";
import { useWorkspace } from "./PrayerWorkspace";
import { DEFAULT_ANALYSIS } from "@/lib/miqat/analysis";
import type { AnalysisPreferences, Calendar, DailyTimeline, Prayer } from "@/lib/miqat/model";
type Connections = {
  calendars: Calendar[];
  selected: string[];
  managementEnabled: boolean;
  writesEnabled: boolean;
};
type Preview = {
  proposal: {
    operation: "create" | "update" | "delete";
    prayer: Prayer;
    start: string;
    end: string;
    reasons: string[];
  };
  token: string;
  writesEnabled: boolean;
};
const base = "/api/google-calendar/intelligence";
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${base}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? "Calendar request failed.");
  return data;
}
export function CalendarIntelligence() {
  const { syncContext } = useWorkspace();
  const [connection, setConnection] = useState<Connections | null>(null),
    [day, setDay] = useState<DailyTimeline | null>(null),
    [preferences, setPreferences] = useState<AnalysisPreferences>(DEFAULT_ANALYSIS),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [target, setTarget] = useState("");
  const input = useMemo(
    () => (syncContext ? { source: syncContext.source, date: syncContext.startDate } : null),
    [syncContext],
  );
  const load = useCallback(async () => {
    try {
      const c = await api<Connections>("calendars");
      if (!Array.isArray(c.calendars) || !Array.isArray(c.selected))
        throw new Error("Calendar connection unavailable. Reconnect or refresh.");
      setConnection(c);
      setTarget(
        (current) =>
          current ||
          c.calendars.find((x) => x.isPrimary && x.isWritable)?.id ||
          c.calendars.find((x) => x.isWritable)?.id ||
          "",
      );
      setPreferences(await api<AnalysisPreferences>("preferences"));
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const analyse = useCallback(async () => {
    if (!input) return;
    setDay(await api<DailyTimeline>("timeline", input));
    setPreview(null);
  }, [input]);
  // Refresh on selected date/source changes, return to the tab, and every five minutes.
  const sourceKey = JSON.stringify(input);
  useEffect(() => {
    if (!connection || !input) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void api<DailyTimeline>("timeline", JSON.parse(sourceKey))
        .then((d) => {
          if (active) {
            setDay(d);
            setPreview(null);
          }
        })
        .catch((e) => {
          if (active) {
            setDay(null);
            setMessage(e.message);
          }
        });
    };
    refresh();
    const timer = setInterval(refresh, 300000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
    // Only refresh when the canonical source/date or saved connection selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, connection]);
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: day?.timezone ?? "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }).format(new Date(value));
  return (
    <Card title="Calendar intelligence">
      <p>
        Read your selected calendars to find uninterrupted prayer time. Existing events are used
        transiently for analysis.
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <div className="form-actions">
        <a
          className="secondary-button"
          href="/api/google-calendar/connect"
          target="_blank"
          rel="noopener noreferrer"
        >
          Connect Google Calendar (read access)
        </a>
        <button disabled={busy} onClick={() => void run(load)}>
          Refresh connection
        </button>
      </div>
      {connection && (
        <>
          <p>
            Read calendar: ON · Calendar management: {connection.managementEnabled ? "ON" : "OFF"} ·
            Production writes: {connection.writesEnabled ? "enabled" : "disabled"}
          </p>
          <fieldset disabled={busy}>
            <legend>Calendars analysed (up to 10)</legend>
            {connection.calendars.map((c) => (
              <label key={c.id} className="flex gap-3">
                <input
                  type="checkbox"
                  checked={connection.selected.includes(c.id)}
                  onChange={(e) =>
                    void run(async () => {
                      const selected = e.target.checked
                        ? [...connection.selected, c.id]
                        : connection.selected.filter((id) => id !== c.id);
                      await api("calendars", { selected });
                      setConnection({ ...connection, selected });
                      setPreview(null);
                    })
                  }
                />
                {c.title}
              </label>
            ))}
          </fieldset>
          <details>
            <summary>Prayer window preferences</summary>
            <p>
              These are scheduling preferences. Confirm prayer-time and Isha-cutoff guidance with
              your local religious authority.
            </p>
            {(["minimumRequiredMinutes", "bufferBefore", "bufferAfter"] as const).map((key, i) => (
              <label key={key} className="block">
                {
                  [
                    "Prayer duration (minutes)",
                    "Before-meeting buffer (minutes)",
                    "After-meeting buffer (minutes)",
                  ][i]
                }
                <input
                  type="number"
                  min={key === "minimumRequiredMinutes" ? 1 : 0}
                  max={key === "minimumRequiredMinutes" ? 120 : 60}
                  value={preferences[key]}
                  onChange={(e) =>
                    setPreferences({ ...preferences, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <label>
              Isha scheduling cutoff
              <select
                value={preferences.ishaEnd}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    ishaEnd: e.target.value as AnalysisPreferences["ishaEnd"],
                  })
                }
              >
                <option value="midpoint">Islamic night midpoint</option>
                <option value="next-fajr">Next Fajr</option>
              </select>
            </label>
            <label>
              Prayer protection
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
                <option value="SUGGEST_ONLY">Suggest only</option>
                <option value="CREATE_CALENDAR_BLOCK">Preview calendar blocks</option>
              </select>
            </label>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("preferences", preferences);
                  await analyse();
                })
              }
            >
              Save preferences
            </button>
          </details>
          <div className="form-actions">
            <button disabled={busy || !input} onClick={() => void run(analyse)}>
              Refresh schedule
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await fetch("/api/google-calendar/disconnect", { method: "POST" });
                  if (!r.ok) throw new Error("Disconnect failed. Please retry.");
                  setConnection(null);
                  setDay(null);
                  setPreview(null);
                  setMessage("Disconnected. Existing calendar events remain.");
                })
              }
            >
              Disconnect Google Calendar
            </button>
          </div>
          {!input && <p>Choose a supported schedule source and date below to analyse your day.</p>}
          {connection.managementEnabled ? (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("management", {});
                  await load();
                })
              }
            >
              Disable calendar management
            </button>
          ) : (
            <form method="post" action="/api/google-calendar/connect" target="_blank">
              <button type="submit">Allow Miqāt to manage calendar events</button>
            </form>
          )}
          <label>
            Protected block destination
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setPreview(null);
              }}
            >
              {connection.calendars
                .filter((c) => c.isWritable)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </label>
        </>
      )}
      {day && (
        <>
          <h3>
            {day.date} · {day.timezone}
          </h3>
          <p>Calendar coverage: {day.calendarStatus}</p>
          {day.analyses.map((a) => (
            <section key={a.prayer} className="my-4">
              <h4 className="font-semibold capitalize">
                {a.prayer} · {a.status.replaceAll("_", " ")}
              </h4>
              <p>
                {time(a.prayerWindow.start)} – {time(a.prayerWindow.end)}
              </p>
              <p>{a.explanation}</p>
              <details>
                <summary>Available windows and conflicts</summary>
                {a.availableWindows.map((w) => (
                  <p key={w.start}>
                    {time(w.start)} – {time(w.end)}
                  </p>
                ))}
                {a.conflictingEvents.map((e) => (
                  <p key={e.id}>
                    {e.title}: {time(e.start)} – {time(e.end)}
                  </p>
                ))}
              </details>
              {a.recommendedWindows.map((r, i) => (
                <div key={r.start}>
                  <p>
                    {i === 0 ? "Recommended" : "Alternative"}: {time(r.start)} – {time(r.end)}
                  </p>
                  <details>
                    <summary>Why this recommendation?</summary>
                    <ul>
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
              {a.recommendedWindows.length > 0 &&
                preferences.protectionMode === "CREATE_CALENDAR_BLOCK" && (
                  <button
                    disabled={busy || !target}
                    onClick={() =>
                      void run(async () =>
                        setPreview(
                          await api<Preview>("prayer-block", {
                            ...input,
                            prayer: a.prayer,
                            calendarId: target,
                          }),
                        ),
                      )
                    }
                  >
                    Preview protected {a.prayer} block
                  </button>
                )}
              {day.events.some(
                (e) => e.metadata.type === "prayer_block" && e.metadata.prayer === a.prayer,
              ) &&
                (["update", "delete"] as const).map((operation) => (
                  <button
                    key={operation}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const block = day.events.find(
                          (e) =>
                            e.metadata.type === "prayer_block" && e.metadata.prayer === a.prayer,
                        )!;
                        setTarget(block.calendarId);
                        setPreview(
                          await api<Preview>("prayer-block", {
                            ...input,
                            prayer: a.prayer,
                            calendarId: block.calendarId,
                            operation,
                          }),
                        );
                      })
                    }
                  >
                    Preview {operation === "update" ? "update" : "removal"} of protected {a.prayer}{" "}
                    block
                  </button>
                ))}
            </section>
          ))}
          <details>
            <summary>Real calendar events</summary>
            {day.events.map((e) => (
              <p key={e.id}>
                {e.title} · {e.allDay ? "All day · " : ""}
                {time(e.start)} – {time(e.end)}
              </p>
            ))}
          </details>
          <details>
            <summary>Sixth of the Night / Qiyām</summary>
            <p>
              Islamic night: {time(day.night.night.start)} – {time(day.night.night.end)}
            </p>
            <p>Midpoint: {time(day.night.midpoint)}</p>
            <p>Last third: {time(day.night.lastThird.start)}</p>
            <p>Parts 4–5 are the Dāwūd prayer period. Parts 5–6 form the last third.</p>
            {day.night.segments.map((s, i) => (
              <p key={i}>
                Part {i + 1}: {time(s.start)} – {time(s.end)}
              </p>
            ))}
          </details>
        </>
      )}
      {preview && (
        <section aria-label="Protected prayer block preview">
          <h3>
            Review {preview.proposal.operation} of protected {preview.proposal.prayer} block
          </h3>
          <p>
            {time(preview.proposal.start)} – {time(preview.proposal.end)}
          </p>
          <p>
            {preview.writesEnabled
              ? "Confirm the proposed change to this verified prayer block."
              : "Calendar writes are disabled. This preview cannot change your calendar."}
          </p>
          <button
            disabled={busy || !preview.writesEnabled || !connection?.managementEnabled}
            onClick={() =>
              void run(async () => {
                await api("prayer-block?action=confirm", {
                  ...input,
                  prayer: preview.proposal.prayer,
                  calendarId: target,
                  token: preview.token,
                  operation: preview.proposal.operation,
                });
                setPreview(null);
                await analyse();
                setMessage("Protected block saved.");
              })
            }
          >
            Confirm {preview.proposal.operation}
          </button>
          <button onClick={() => setPreview(null)}>Cancel</button>
        </section>
      )}
    </Card>
  );
}
