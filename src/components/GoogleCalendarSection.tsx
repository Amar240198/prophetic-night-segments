"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { formatCalendarTime } from "@/lib/calendar/buildCalendarEvents";
import { GOOGLE_MESSAGES, type GoogleErrorCode } from "@/lib/google-calendar/errors";
import {
  DEFAULT_SYNC_NIGHTS,
  FIXED_SYNC_HORIZONS,
  CONTINUOUS_SYNC_NIGHTS,
  type SyncPreference,
  type SyncContext,
  type SyncOptions,
  type SyncResult,
  type SyncSelection,
} from "@/lib/google-calendar/sync";
import type { GoogleEventId } from "@/lib/google-calendar/plan";
import type { EventOutcome } from "@/lib/google-calendar/events.server";
import type { RemovalRequest, RemovalResult } from "@/lib/google-calendar/removal";

interface Connection {
  connected: boolean;
  configured: boolean;
  email?: string;
  expiresAt?: number;
  syncPreference?: SyncPreference | null;
  syncSelection?: SyncSelection;
}
const buttonClass =
  "border border-[#d0ae67] px-4 py-2 text-sm font-semibold text-[#d0ae67] hover:bg-[#d0ae67]/10 disabled:opacity-40";
export function GoogleCalendarSection({
  events,
  valid,
  syncContext,
  syncOptions,
  localNight,
}: {
  events: CalendarEvent[];
  valid: boolean;
  syncContext?: SyncContext | null;
  syncOptions?: SyncOptions;
  localNight?: string;
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
  const [syncReport, setSyncReport] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [removalReport, setRemovalReport] = useState<RemovalResult | null>(null);
  const [retryRemoval, setRetryRemoval] = useState<RemovalRequest | null>(null);
  const selectionRevision = useRef<string | null | undefined>(undefined);
  const selectionEpoch = useRef(0);
  const [horizon, setHorizon] = useState<number | "continuous">(DEFAULT_SYNC_NIGHTS);
  const horizonEdited = useRef(false);
  const syncNights = horizon === "continuous" ? CONTINUOUS_SYNC_NIGHTS : horizon;
  const checking = useRef<Promise<boolean> | null>(null);
  const popup = useRef<Window | null>(null);
  const inFlight = useRef(false);
  const selectedEvents = events.filter((event) => selected.includes(event.id));
  const acceptSelection = useCallback((selection?: SyncSelection) => {
    if (
      !selection ||
      !Array.isArray(selection.selected) ||
      !(selection.revision === null || typeof selection.revision === "string")
    )
      return;
    if (selectionRevision.current !== selection.revision) setSelected(selection.selected);
    selectionRevision.current = selection.revision;
  }, []);

  const checkConnection = useCallback((): Promise<boolean> => {
    // Serialize checks so a pre-callback response cannot overwrite a newer connected response.
    if (checking.current) return checking.current;
    const epoch = selectionEpoch.current;
    const pending = fetch("/api/google-calendar/session", {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          setError(
            GOOGLE_MESSAGES[body.error?.code as GoogleErrorCode] ??
              GOOGLE_MESSAGES.CONNECTION_FAILED,
          );
          return false;
        }
        if (typeof body.connected !== "boolean" || typeof body.configured !== "boolean")
          throw new Error();
        if (epoch !== selectionEpoch.current || inFlight.current) return body.connected;
        setConnection(body);
        acceptSelection(body.syncSelection);
        if (!horizonEdited.current && body.syncPreference) {
          if (body.syncPreference.mode === "continuous") setHorizon("continuous");
          else if (
            body.syncPreference.mode === "fixed" &&
            FIXED_SYNC_HORIZONS.includes(body.syncPreference.horizonDays)
          )
            setHorizon(body.syncPreference.horizonDays);
        }
        if (body.connected) {
          setConnecting(false);
          setError("");
        }
        return body.connected as boolean;
      })
      .catch(() => {
        setError(
          "Unable to check Google Calendar connection. Retrying while sign-in is in progress.",
        );
        return false;
      })
      .finally(() => {
        checking.current = null;
      });
    checking.current = pending;
    return pending;
  }, [acceptSelection]);

  useEffect(() => {
    void checkConnection();
    // Also recover when browser isolation makes popup.closed appear true early,
    // or the parent tab was suspended while Google completed authentication.
    const onFocus = () => {
      void checkConnection();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onFocus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkConnection]);
  useEffect(() => {
    if (!connecting) return;
    let closedAt: number | null = null;
    let lastCheck = 0;
    let active = true;
    function verify() {
      lastCheck = Date.now();
      void checkConnection().then((connected) => {
        if (active && !connected && closedAt !== null && Date.now() - closedAt >= 15_000) {
          setConnecting(false);
          setError(
            "Google sign-in closed, but a connection could not be confirmed. Please reconnect and approve Calendar access.",
          );
        }
      });
    }
    const interval = window.setInterval(() => {
      if (popup.current?.closed && closedAt === null) {
        closedAt = Date.now();
        verify();
      } else if (Date.now() - lastCheck >= 2500) verify();
    }, 500);
    const timeout = window.setTimeout(() => {
      setConnecting(false);
      setError(
        "Google sign-in timed out. Please reconnect and complete the Google consent screen.",
      );
    }, 600_000);
    function receive(event: MessageEvent) {
      if (
        event.origin !== window.location.origin ||
        event.source !== popup.current ||
        event.data?.type !== "pns-google-calendar"
      )
        return;
      if (event.data.status === "connected") verify();
      else {
        setConnecting(false);
        setError(
          GOOGLE_MESSAGES[event.data.status as GoogleErrorCode] ??
            GOOGLE_MESSAGES.CONNECTION_FAILED,
        );
      }
    }
    window.addEventListener("message", receive);
    window.addEventListener("focus", verify);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      window.removeEventListener("focus", verify);
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
      setSyncReport(null);
      setRemovalReport(null);
      setRetryRemoval(null);
      setSelected([]);
      selectionRevision.current = undefined;
      selectionEpoch.current++;
      setHorizon(DEFAULT_SYNC_NIGHTS);
      horizonEdited.current = false;
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
    setRemovalReport(null);
    setRetryRemoval(null);
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
      else setMessage("Your selected Qiyam / Tahajjud plan is in your primary Google Calendar.");
    } catch {
      setError(
        "Unable to create calendar event. You can retry safely to check for events already created.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function sync() {
    if (inFlight.current || !valid || !selectedEvents.length || !syncContext || !syncOptions)
      return;
    inFlight.current = true;
    selectionEpoch.current++;
    setBusy(true);
    setSyncing(true);
    setError("");
    setMessage(`Adding ${syncNights} nights…`);
    setReport(null);
    setSyncReport(null);
    setRemovalReport(null);
    setRetryRemoval(null);
    try {
      const response = await fetch("/api/google-calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(310_000),
        body: JSON.stringify({
          ...syncContext,
          nights: syncNights,
          mode: horizon === "continuous" ? "continuous" : "fixed",
          options: syncOptions,
          selected: selectedEvents.map((event) => event.id as GoogleEventId),
          selectionRevision: selectionRevision.current,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage("");
        setError(
          GOOGLE_MESSAGES[body.error?.code as GoogleErrorCode] ?? GOOGLE_MESSAGES.EVENT_FAILED,
        );
        return;
      }
      if (
        body.nights !== syncNights ||
        !Number.isInteger(body.syncedNights) ||
        !Array.isArray(body.outcomes) ||
        body.outcomes.length !== syncNights * selectedEvents.length
      )
        throw new Error();
      setSyncReport(body);
      acceptSelection(body.syncSelection);
      const failed = body.outcomes.filter(
        (item: { status: string }) => item.status === "failed",
      ).length;
      setMessage(
        failed
          ? `${body.syncedNights} of ${body.nights} nights fully synced. ${failed} events failed or were not attempted.`
          : `${body.nights} nights synced to Google Calendar`,
      );
      if (failed)
        setError(
          "Some events were not synced. Review the dated results below. Retrying the same dates will not duplicate synced events.",
        );
    } catch {
      setMessage("");
      setError(
        "The sync result could not be confirmed. Some events may have been saved. Retry the same dates to finish safely without duplicates.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
      setSyncing(false);
      selectionEpoch.current++;
    }
  }
  async function remove(input: RemovalRequest) {
    if (inFlight.current) return;
    if (
      input.scope === "horizon" &&
      !window.confirm(
        `Remove from synced horizon: ${input.nights} nights starting ${input.startDate}. Up to ${input.nights * input.selected.length} app-owned events may be removed (${input.selected.map((id) => events.find((event) => event.id === id)?.title ?? id).join(", ")}). These types will also be removed from your saved sync selection, including if deletion partially fails. Other event types remain. Continue?`,
      )
    )
      return;
    inFlight.current = true;
    selectionEpoch.current++;
    setBusy(true);
    setError("");
    setMessage("Removing selected app-owned events…");
    setReport(null);
    setSyncReport(null);
    setRemovalReport(null);
    setRetryRemoval(null);
    // Uncheck removal targets immediately, including if the network response is lost.
    if (input.scope === "horizon")
      setSelected((current) =>
        current.filter((id) => !input.selected.includes(id as GoogleEventId)),
      );
    try {
      const response = await fetch("/api/google-calendar/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(310_000),
        body: JSON.stringify(input),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage("");
        setError(
          GOOGLE_MESSAGES[body.error?.code as GoogleErrorCode] ?? GOOGLE_MESSAGES.REMOVE_FAILED,
        );
        setRetryRemoval(input);
        return;
      }
      const expected =
        input.scope === "horizon"
          ? input.nights * input.selected.length
          : input.events.length * (input.startDate ? 2 : 1);
      if (
        body.scope !== input.scope ||
        !Array.isArray(body.outcomes) ||
        body.outcomes.length !== expected ||
        body.outcomes.some(
          (item: { status: string }) => !["removed", "absent", "failed"].includes(item.status),
        )
      )
        throw new Error();
      const result = body as RemovalResult;
      acceptSelection(result.syncSelection);
      setRemovalReport(result);
      const failed = result.outcomes.filter((item) => item.status === "failed").length;
      const removed = result.outcomes.filter((item) => item.status === "removed").length;
      const absent = result.outcomes.filter((item) => item.status === "absent").length;
      setMessage(
        `${removed} events removed; ${absent} already absent. ${failed} failed or were not attempted.`,
      );
      if (failed) {
        setError(
          input.scope === "horizon"
            ? "Some events were not removed. Their mappings were preserved. Retry removal below; saved sync selections already exclude the removed types."
            : "Some events were not removed. Any failed mappings were preserved. Retry removal below; saved horizon selections are unchanged.",
        );
        setRetryRemoval(
          input.scope === "horizon"
            ? { ...input, selectionRevision: result.syncSelection?.revision }
            : input,
        );
      }
    } catch {
      setMessage("");
      setError(
        "Removal could not be confirmed. Some events may already be removed. Check connection to reload saved selections, then retry removal safely.",
      );
      setRetryRemoval(input);
    } finally {
      inFlight.current = false;
      selectionEpoch.current++;
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
          <p role="status" className="mt-3 text-sm">
            Google Calendar connected
          </p>
          <p className="mt-1 text-sm">Connected as: {connection.email}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() => setReviewing(!reviewing)}
              aria-expanded={reviewing}
            >
              Add Qiyam / Tahajjud Plan to Calendar
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
                markers last one minute; prayer windows and night parts retain their calculated
                duration. Optional planning only.
              </p>
              <fieldset disabled={busy} className="mt-4 grid gap-2">
                <legend className="mb-2 text-sm">Google Calendar events to add or remove</legend>
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
              <p className="mt-4 text-sm" id="one-night-removal-scope">
                Add or remove from this night only{localNight ? ` (${localNight})` : ""}. Removal
                checks app-owned one-night events at the displayed times and mapped events for this
                night. Saved horizon selections are unchanged.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={`${buttonClass} mt-4`}
                  disabled={busy || !valid || !selectedEvents.length}
                  onClick={() => void submit()}
                >
                  {busy ? "Working…" : `Add selected events (${selectedEvents.length})`}
                </button>
                <button
                  type="button"
                  className={`${buttonClass} mt-4`}
                  aria-describedby="one-night-removal-scope"
                  disabled={busy || !valid || !selectedEvents.length}
                  onClick={() =>
                    void remove({ scope: "night", events: selectedEvents, startDate: localNight })
                  }
                >
                  Remove selected events ({selectedEvents.length})
                </button>
              </div>
              {syncContext && syncOptions ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <fieldset disabled={busy} className="mb-4">
                    <legend className="mb-2">Sync calendar for:</legend>
                    <div className="flex flex-wrap gap-3">
                      {[...FIXED_SYNC_HORIZONS, "continuous" as const].map((choice) => (
                        <label key={choice} className={`${buttonClass} flex items-center gap-2`}>
                          <input
                            type="radio"
                            name="google-sync-horizon"
                            value={choice}
                            checked={horizon === choice}
                            onChange={() => {
                              horizonEdited.current = true;
                              setHorizon(choice);
                            }}
                          />
                          {choice === "continuous" ? "Continuous" : `${choice} days`}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  {horizon === "continuous" && (
                    <p className="mb-3 text-sm" role="note">
                      Continuous saves your rolling-sync preference and syncs the first{" "}
                      {CONTINUOUS_SYNC_NIGHTS} nights now. Automatic renewal is not enabled yet; run
                      sync again to extend the calendar.
                    </p>
                  )}
                  <p className="text-sm">
                    Sync {syncNights} consecutive nights starting {syncContext.startDate}, using the
                    prayer source from your last calculation. Each night uses its own prayer times.
                    Only checked events are included. Your choice is saved when you sync. Shortening
                    the horizon does not delete existing events.
                  </p>
                  <button
                    type="button"
                    className={`${buttonClass} mt-3`}
                    disabled={busy || !valid || !selectedEvents.length}
                    onClick={() => void sync()}
                  >
                    {syncing
                      ? `Adding ${syncNights} nights…`
                      : `Sync ${syncNights} nights to Google Calendar`}
                  </button>
                  <p id="horizon-removal-scope" className="mt-4 text-sm">
                    Remove from synced horizon: {syncNights} nights starting {syncContext.startDate}
                    . Only mapped app-owned events of the checked types are removed. Those types are
                    also removed from your saved sync selection; select them again explicitly to add
                    them in a future sync.
                  </p>
                  <button
                    type="button"
                    className={`${buttonClass} mt-3`}
                    aria-describedby="horizon-removal-scope"
                    disabled={busy || !selectedEvents.length}
                    onClick={() =>
                      void remove({
                        scope: "horizon",
                        startDate: syncContext.startDate,
                        nights: syncNights,
                        mode: horizon === "continuous" ? "continuous" : "fixed",
                        selected: selectedEvents.map((event) => event.id as GoogleEventId),
                        selectionRevision: selectionRevision.current,
                      })
                    }
                  >
                    Remove from synced horizon ({syncNights} nights)
                  </button>
                </div>
              ) : (
                <p className="mt-4 text-sm">
                  For multi-night sync, calculate with a dated prayer-time source above. Manual
                  times and demonstrations cover only one night.
                </p>
              )}
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
      {connection?.connected && error && (
        <button
          type="button"
          className={`${buttonClass} mt-3`}
          disabled={busy}
          onClick={() => void checkConnection()}
        >
          Check connection
        </button>
      )}
      {removalReport && (
        <ul aria-label="Google Calendar removal results" className="mt-3 space-y-2 text-sm">
          {removalReport.outcomes.map((item) => (
            <li key={`${item.identity}-${item.date ?? "night"}-${item.id}`}>
              {item.date ?? "This night"} —{" "}
              {events.find((event) => event.id === item.id)?.title ?? item.id} (
              {item.identity === "mapped" ? "synced event" : "one-night event"}):{" "}
              {item.status === "removed"
                ? "Removed"
                : item.status === "absent"
                  ? "Already absent"
                  : GOOGLE_MESSAGES[item.code ?? "REMOVE_FAILED"]}
            </li>
          ))}
        </ul>
      )}
      {retryRemoval && (
        <button
          type="button"
          className={`${buttonClass} mt-3`}
          disabled={busy}
          onClick={() =>
            void remove(
              retryRemoval.scope === "horizon"
                ? { ...retryRemoval, selectionRevision: selectionRevision.current }
                : retryRemoval,
            )
          }
        >
          Retry removal (
          {retryRemoval.scope === "horizon" ? `${retryRemoval.nights} nights` : "this night"})
        </button>
      )}
      {syncReport && (
        <details className="mt-4" open={syncReport.syncedNights !== syncReport.nights}>
          <summary>Calendar sync results by night</summary>
          <ul aria-label="Google Calendar nightly sync results" className="mt-3 space-y-2 text-sm">
            {syncReport.outcomes.map((item) => (
              <li key={`${item.date}-${item.id}`}>
                {item.date} — {events.find((event) => event.id === item.id)?.title ?? item.id}:{" "}
                {item.status === "failed"
                  ? GOOGLE_MESSAGES[item.code ?? "EVENT_FAILED"]
                  : item.status === "existing"
                    ? "Already synced"
                    : item.status === "updated"
                      ? "Updated"
                      : "Added"}
              </li>
            ))}
          </ul>
        </details>
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
