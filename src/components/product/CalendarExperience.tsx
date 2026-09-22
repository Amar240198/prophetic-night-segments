"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { productApi, useProduct } from "./ProductContext";
import type { CalendarSettingsData } from "./CalendarSettings";
import type { DailyTimeline, Prayer } from "@/lib/miqat/model";
import { Paywall } from "./Paywall";
const labels = {
  CLEAR: "An uninterrupted prayer window is available",
  TIGHT: "A short prayer window is available",
  PARTIAL_CONFLICT: "Part of this prayer window overlaps your schedule",
  FULL_CONFLICT: "No uninterrupted prayer window found",
  PROTECTED: "Prayer time is protected",
  UNKNOWN: "Calendar availability could not be checked",
};
type Preview = {
  proposal: {
    operation: "create" | "update" | "delete";
    prayer: Prayer;
    start: string;
    end: string;
  };
  token: string;
  writesEnabled: boolean;
};
export function CalendarExperience() {
  const { state, day } = useProduct();
  const [timeline, setTimeline] = useState<DailyTimeline | null>(null),
    [connection, setConnection] = useState<CalendarSettingsData | null>(null),
    [status, setStatus] = useState("loading"),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false);
  const pro = state?.entitlements.features["calendar-read"] === true;
  const sourceKey = JSON.stringify(day ? { date: day.date, source: day.source } : null);
  const refresh = useCallback(async () => {
    if (!pro || !day) return;
    setStatus("loading");
    setTimeline(null);
    setPreview(null);
    try {
      const session = await productApi<{ connected: boolean }>("/api/google-calendar/session");
      if (!session.connected) {
        setStatus("disconnected");
        return;
      }
      const c = await productApi<CalendarSettingsData>(
        "/api/google-calendar/intelligence/calendars",
      );
      setConnection(c);
      if (!c.selected.length) {
        setStatus("not-selected");
        return;
      }
      const result = await productApi<DailyTimeline>(
        "/api/google-calendar/intelligence/timeline",
        { date: day.date, source: day.source },
        "POST",
      );
      setTimeline(result);
      setStatus(result.calendarStatus);
      setMessage("");
    } catch (e) {
      setStatus("unavailable");
      setTimeline(null);
      setMessage((e as Error).message);
    }
  }, [pro, day]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronise initial state from an external service or browser storage.
    void refresh();
  }, [refresh, sourceKey]);
  if (!state) return <p role="status">Loading your schedule…</p>;
  if (!pro) return <Paywall />;
  if (!day) return <p>Load your prayer times to see calendar recommendations.</p>;
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: day.timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  async function protect(prayer: Prayer) {
    if (!connection?.destination) return;
    setBusy(true);
    setMessage("");
    try {
      setPreview(
        await productApi<Preview>(
          "/api/google-calendar/intelligence/prayer-block",
          { date: day!.date, source: day!.source, prayer, calendarId: connection.destination },
          "POST",
        ),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="app-card" aria-label="Calendar intelligence">
      <h2>Salah and your schedule</h2>
      {status === "loading" && <p role="status">Loading your calendar…</p>}
      {status === "disconnected" && (
        <>
          <p>Connect your calendar to see Salah alongside your schedule.</p>
          <Link className="primary-button" href="/app/settings#calendar">
            Connect Google Calendar
          </Link>
        </>
      )}
      {status === "not-selected" && (
        <>
          <p>No calendar selected. Choose which calendars Miqāt should analyse.</p>
          <Link href="/app/settings#calendar">Choose calendars</Link>
        </>
      )}
      {status === "unavailable" && (
        <p role="status">
          Your calendar could not be checked. Prayer times remain available.{" "}
          <Link href="/app/settings#calendar">Check connection</Link>
        </p>
      )}
      {timeline && (
        <>
          <ol className="day-timeline">
            {[
              ...timeline.events.map((e) => ({
                id: e.id,
                title: e.title,
                start: e.start,
                end: e.end,
                kind:
                  e.metadata.type === "prayer_block" ? "Protected prayer block" : "Calendar event",
              })),
              ...timeline.analyses.map((a) => ({
                id: a.prayer,
                title: a.prayer,
                start: a.prayerWindow.start,
                end: a.prayerWindow.end,
                kind: "Prayer window",
              })),
            ]
              .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
              .map((e) => (
                <li key={e.id}>
                  <time>
                    {time(e.start)} – {time(e.end)}
                  </time>
                  <div>
                    <strong>{e.title}</strong>
                    <span>{e.kind}</span>
                  </div>
                </li>
              ))}
          </ol>
          {!timeline.events.length && <p>No calendar events in this period.</p>}
          {timeline.analyses.map((a) => (
            <section className="prayer-analysis" key={a.prayer}>
              <h3 className="capitalize">{a.prayer}</h3>
              <p>{labels[a.status]}</p>
              <p>{a.explanation}</p>
              {a.recommendedWindows.slice(0, 1).map((r) => (
                <div key={r.start}>
                  <p>
                    Recommended: {time(r.start)} – {time(r.end)}
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
              {a.recommendedWindows.length > 0 && a.status !== "PROTECTED" && (
                <button
                  disabled={busy || !connection?.destination}
                  onClick={() => void protect(a.prayer)}
                >
                  Protect {a.prayer}
                </button>
              )}
            </section>
          ))}
          {!connection?.destination && (
            <Link href="/app/settings#calendar">Choose a destination calendar in Settings</Link>
          )}
        </>
      )}
      {preview && (
        <section aria-label="Protected prayer block preview">
          <h3>Review protected {preview.proposal.prayer} time</h3>
          <p>
            {time(preview.proposal.start)} – {time(preview.proposal.end)}
          </p>
          <p>
            {preview.writesEnabled
              ? "Confirm this change to your Miqāt prayer block."
              : "Calendar management is currently unavailable. This preview does not change your calendar."}
          </p>
          <button
            disabled={busy || !preview.writesEnabled || !connection?.managementEnabled}
            onClick={async () => {
              setBusy(true);
              try {
                await productApi(
                  "/api/google-calendar/intelligence/prayer-block?action=confirm",
                  {
                    date: day.date,
                    source: day.source,
                    prayer: preview.proposal.prayer,
                    calendarId: connection?.destination,
                    token: preview.token,
                    operation: preview.proposal.operation,
                  },
                  "POST",
                );
                setPreview(null);
                await refresh();
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm prayer block
          </button>
          <button onClick={() => setPreview(null)}>Cancel</button>
        </section>
      )}
      {message && <p role="alert">{message}</p>}
      <div className="form-actions">
        <button onClick={() => void refresh()}>Refresh schedule</button>
        <Link href="/app/settings#calendar">Manage calendars</Link>
        <Link href="/app/automations">Manage automation</Link>
      </div>
    </section>
  );
}
