"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { formatCalendarTime } from "@/lib/calendar/buildCalendarEvents";
import { GOOGLE_MESSAGES, type GoogleErrorCode } from "@/lib/google-calendar/errors";
import type { EventOutcome } from "@/lib/google-calendar/events.server";

interface Connection {
  connected: boolean;
  configured: boolean;
  email?: string;
  expiresAt?: number;
}
const buttonClass =
  "border border-[#d0ae67] px-4 py-2 text-sm font-semibold text-[#d0ae67] hover:bg-[#d0ae67]/10 disabled:opacity-40";
export function GoogleCalendarSection({
  events,
  valid,
}: {
  events: CalendarEvent[];
  valid: boolean;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<{
    outcomes: EventOutcome[];
    events: CalendarEvent[];
  } | null>(null);
  const popup = useRef<Window | null>(null);
  const inFlight = useRef(false);
  const selectedEvents = events.filter((event) => selected.includes(event.id));

  const checkConnection = useCallback(() => {
    return fetch("/api/google-calendar/session", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          setConnection({ connected: false, configured: true });
          setError(
            GOOGLE_MESSAGES[body.error?.code as GoogleErrorCode] ??
              GOOGLE_MESSAGES.CONNECTION_FAILED,
          );
          setConnecting(false);
          return;
        }
        if (typeof body.connected !== "boolean" || typeof body.configured !== "boolean")
          throw new Error();
        setConnection(body);
        if (body.connected) {
          setConnecting(false);
          setError("");
        }
      })
      .catch(() => {
        setError(GOOGLE_MESSAGES.CONNECTION_FAILED);
      });
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);
  useEffect(() => {
    if (!connecting) return;
    // Polling also handles providers/browsers that sever window.opener during OAuth.
    const interval = window.setInterval(() => {
      void checkConnection();
    }, 2500);
    const timeout = window.setTimeout(() => {
      setConnecting(false);
      setError(GOOGLE_MESSAGES.CONNECTION_FAILED);
    }, 600_000);
    function receive(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== popup.current ||
        event.data?.type !== "pns-google-calendar"
      )
        return;
      setConnecting(false);
      if (event.data.status === "connected") void checkConnection();
      else
        setError(
          GOOGLE_MESSAGES[event.data.status as GoogleErrorCode] ??
            GOOGLE_MESSAGES.CONNECTION_FAILED,
        );
    }
    window.addEventListener("message", receive);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [connecting, checkConnection]);
  useEffect(() => {
    if (!connection?.connected || !connection.expiresAt) return;
    const timer = window.setTimeout(
      () => {
        setConnection({ connected: false, configured: true });
        setError(GOOGLE_MESSAGES.SESSION_EXPIRED);
      },
      Math.max(0, connection.expiresAt - Date.now() - 10_000),
    );
    return () => window.clearTimeout(timer);
  }, [connection]);

  function connect() {
    setError("");
    setMessage("");
    popup.current = window.open(
      "/api/google-calendar/connect",
      "pns-google-calendar",
      "popup,width=520,height=720",
    );
    if (!popup.current) {
      setError("Allow popups for this site, then click Connect Google Calendar again.");
      return;
    }
    setConnecting(true);
  }
  async function disconnect() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/google-calendar/disconnect", { method: "POST" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setConnection({ connected: false, configured: true });
      setReport(null);
      setReviewing(false);
      setMessage(
        body.revoked
          ? "Google Calendar disconnected. Existing events remain in your calendar."
          : "Disconnected from this app. Google access could not be revoked; remove this app from your Google Account’s third-party connections if needed.",
      );
    } catch {
      setError("Unable to disconnect Google Calendar. Please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (inFlight.current || !valid || !selectedEvents.length) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    setReport(null);
    const submittedEvents = selectedEvents;
    try {
      const response = await fetch("/api/google-calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: submittedEvents }),
      });
      const body = await response.json();
      if (!response.ok) {
        const code = body.error?.code as GoogleErrorCode;
        setError(GOOGLE_MESSAGES[code] ?? GOOGLE_MESSAGES.EVENT_FAILED);
        if (["SESSION_EXPIRED", "UNAUTHENTICATED"].includes(code))
          setConnection({ connected: false, configured: true });
        return;
      }
      if (!Array.isArray(body.outcomes)) throw new Error();
      setReport({ outcomes: body.outcomes, events: submittedEvents });
      if (body.outcomes.some((item: EventOutcome) => item.code === "SESSION_EXPIRED"))
        setConnection({ connected: false, configured: true });
      if (body.outcomes.some((item: EventOutcome) => item.status === "failed"))
        setError(
          "Some events could not be added. Review the results below; retrying will skip events already created.",
        );
      else setMessage("Your selected Qiyam plan is in your primary Google Calendar.");
    } catch {
      setError(
        "Unable to create calendar event. You can retry safely to check for events already created.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mt-6 border-t border-white/10 pt-5" aria-labelledby="google-calendar-title">
      <h3 id="google-calendar-title" className="font-serif text-2xl">
        Google Calendar
      </h3>
      {!connection && !error && (
        <p role="status" className="mt-3 text-sm">
          Checking connection…
        </p>
      )}
      {connection?.configured === false && (
        <p className="mt-3 text-sm text-[#9baca7]">{GOOGLE_MESSAGES.NOT_CONFIGURED}</p>
      )}
      {connection?.connected ? (
        <>
          <p className="mt-3 text-sm">Connected as: {connection.email}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => setReviewing(!reviewing)}
              aria-expanded={reviewing}
            >
              Add Qiyam Plan to Calendar
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect Google Calendar
            </button>
          </div>
          {reviewing && (
            <div className="mt-4">
              <p className="text-sm text-[#9baca7]">
                Choose events for your primary calendar. Wake time uses the buffer above. Boundary
                markers last one minute; prayer windows retain their calculated duration. Optional
                planning only.
              </p>
              <fieldset disabled={busy} className="mt-4 grid gap-2">
                <legend className="mb-2 text-sm">Google Calendar events to add</legend>
                {events.map((event) => (
                  <label
                    key={event.id}
                    className="flex items-center gap-3 border border-white/10 p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(event.id)}
                      onChange={(change) =>
                        setSelected(
                          change.target.checked
                            ? [...selected, event.id]
                            : selected.filter((id) => id !== event.id),
                        )
                      }
                    />
                    <span>
                      {event.title}
                      <span className="mt-1 block text-xs text-[#9baca7]">
                        {!valid && event.id === "wake"
                          ? "Enter a valid wake buffer above"
                          : formatCalendarTime(event.start, event.timeZone)}
                        {event.start !== event.end &&
                          ` – ${formatCalendarTime(event.end, event.timeZone)}`}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button
                type="button"
                className={`${buttonClass} mt-4`}
                disabled={busy || !valid || !selectedEvents.length}
                onClick={() => void submit()}
              >
                {busy ? "Working…" : `Add selected events (${selectedEvents.length})`}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={connecting || connection?.configured === false || !connection}
            onClick={connect}
          >
            {connecting ? "Waiting for Google…" : "Connect Google Calendar"}
          </button>
          {(connecting || error) && (
            <button type="button" className={buttonClass} onClick={() => void checkConnection()}>
              Check connection
            </button>
          )}
          {connecting && (
            <button
              type="button"
              className={buttonClass}
              onClick={() => {
                popup.current?.close();
                setConnecting(false);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-[#c8d4d0]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {report && (
        <ul aria-label="Google Calendar submission results" className="mt-3 space-y-2 text-sm">
          {report.outcomes.map((outcome) => {
            const event = report.events.find((item) => item.id === outcome.id);
            return (
              <li key={outcome.id}>
                {event?.title}:{" "}
                {outcome.status === "created"
                  ? "Added"
                  : outcome.status === "existing"
                    ? "Already added"
                    : GOOGLE_MESSAGES[outcome.code ?? "EVENT_FAILED"]}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
