"use client";
import { T, useI18n } from "@/components/i18n/LocaleProvider";
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
  const { t } = useI18n();
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
    <section className="product-form" aria-label={t("Calendar connection")}>
      {loading ? (
        <p role="status">
          <T>{"Checking calendar connection…"}</T>
        </p>
      ) : !data ? (
        <>
          <p>
            <T>{"Connect your calendar to see Salah alongside your schedule."}</T>
          </p>
          {canAnalyse && (
            <a className="primary-button" href="/api/google-calendar/connect">
              <T>{"Connect Google Calendar"}</T>
            </a>
          )}
        </>
      ) : (
        <>
          <p>
            <T>{"Connected as "}</T>
            {email ? <bdi>{email}</bdi> : <T>{"your Google account"}</T>}
          </p>
          <p>
            <T>{"Read access: "}</T>
            <T>{canAnalyse ? "Connected" : "Analysis requires Miqāt Pro"}</T>
          </p>
          {canAnalyse && (
            <>
              <fieldset>
                <legend>
                  <T>{"Calendars Miqāt analyses"}</T>
                </legend>
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
                    <T>{c.isPrimary ? " (Primary)" : ""}</T>
                  </label>
                ))}
              </fieldset>
              <label>
                <T>{"Destination calendar"}</T>
                <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="">
                    <T>{"Choose a destination"}</T>
                  </option>
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
                <T>{"Save calendar choices"}</T>
              </button>
              <p>
                <T>{"Calendar management: "}</T>
                <T>{data.managementEnabled ? "Permission granted" : "Not enabled"}</T>
              </p>
              <p>
                <T>
                  {data.writesEnabled
                    ? "Miqāt can manage its own calendar blocks when you enable automation."
                    : "Calendar management is currently unavailable. Your calendar can still be analysed."}
                </T>
              </p>
              {!data.managementEnabled && (
                <form method="post" action="/api/google-calendar/connect">
                  <button disabled={!data.writesEnabled}>
                    <T>{"Allow calendar management"}</T>
                  </button>
                </form>
              )}
            </>
          )}
          <div className="form-actions">
            {canAnalyse && (
              <a href="/api/google-calendar/connect">
                <T>{"Reconnect Google Calendar"}</T>
              </a>
            )}
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
              <T>{"Disconnect Google Calendar"}</T>
            </button>
          </div>
        </>
      )}
      {message && (
        <p role="status">
          <T>{message}</T>
        </p>
      )}
      <p>
        <T>
          {
            "Miqāt reads events from the calendars you select to find prayer windows. It never changes your ordinary meetings."
          }
        </T>
      </p>
    </section>
  );
}
