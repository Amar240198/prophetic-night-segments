"use client";
import { useCallback, useEffect, useState } from "react";
import type { Calendar } from "@/lib/miqat/model";
import { productApi } from "./ProductContext";
export interface CalendarSettingsData {
  calendars: Calendar[];
  selected: string[];
  destination?: string;
  managementEnabled: boolean;
  writesEnabled: boolean;
}
export function CalendarSettings({ canAnalyse = true }: { canAnalyse?: boolean }) {
  const [data, setData] = useState<CalendarSettingsData | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [destination, setDestination] = useState(""),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const session = await productApi<{ connected: boolean; email?: string }>(
        "/api/google-calendar/session",
      );
      if (!session.connected) {
        setData(null);
        return;
      }
      setEmail(session.email ?? "");
      if (!canAnalyse) {
        setData({
          calendars: [],
          selected: [],
          destination: "",
          managementEnabled: false,
          writesEnabled: false,
        });
        return;
      }
      const value = await productApi<CalendarSettingsData>(
        "/api/google-calendar/intelligence/calendars",
      );
      setData(value);
      setSelected(value.selected);
      setDestination(value.destination ?? "");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canAnalyse]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronise initial state from an external service or browser storage.
    void load();
    const listener = () => {
      void load();
    };
    window.addEventListener("focus", listener);
    return () => window.removeEventListener("focus", listener);
  }, [load]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="product-form" aria-label="Calendar connection">
      {loading ? (
        <p role="status">Checking calendar connection…</p>
      ) : !data ? (
        <>
          <p>Connect your calendar to see Salah alongside your schedule.</p>
          {canAnalyse && (
            <a className="primary-button" href="/api/google-calendar/connect">
              Connect Google Calendar
            </a>
          )}
        </>
      ) : (
        <>
          <p>Connected as {email || "your Google account"}</p>
          <p>Read access: {canAnalyse ? "Connected" : "Analysis requires Miqāt Pro"}</p>
          {canAnalyse && (
            <>
              <fieldset>
                <legend>Calendars Miqāt analyses</legend>
                {data.calendars.map((c) => (
                  <label key={c.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(c.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, c.id]
                            : selected.filter((id) => id !== c.id),
                        )
                      }
                    />
                    {c.title}
                    {c.isPrimary ? " (Primary)" : ""}
                  </label>
                ))}
              </fieldset>
              <label>
                Destination calendar
                <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="">Choose a destination</option>
                  {data.calendars
                    .filter((c) => c.isWritable)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await productApi(
                      "/api/google-calendar/intelligence/calendars",
                      { selected, destination },
                      "POST",
                    );
                    setMessage("Calendar choices saved.");
                  })
                }
              >
                Save calendar choices
              </button>
              <p>
                Calendar management: {data.managementEnabled ? "Permission granted" : "Not enabled"}
              </p>
              <p>
                {data.writesEnabled
                  ? "Miqāt can manage its own calendar blocks when you enable automation."
                  : "Calendar management is currently unavailable. Your calendar can still be analysed."}
              </p>
              {!data.managementEnabled && (
                <form method="post" action="/api/google-calendar/connect">
                  <button disabled={!data.writesEnabled}>Allow calendar management</button>
                </form>
              )}
            </>
          )}
          <div className="form-actions">
            {canAnalyse && <a href="/api/google-calendar/connect">Reconnect Google Calendar</a>}
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await productApi("/api/google-calendar/disconnect", {}, "POST");
                  setData(null);
                  setMessage("Disconnected. Existing calendar events remain unchanged.");
                })
              }
            >
              Disconnect Google Calendar
            </button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        Miqāt reads events from the calendars you select to find prayer windows. It never changes
        your ordinary meetings.
      </p>
    </section>
  );
}
