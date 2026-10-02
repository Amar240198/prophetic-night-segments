"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  resolveDailyPrayerInstants,
  type DailyPrayerSchedule,
} from "@/lib/calendar/buildCalendarEvents";
import {
  DEFAULT_QAYLULA,
  parseQaylula,
  qaylulaRoutine,
  resolveQaylula,
  type QaylulaConfig,
} from "@/lib/routines/qaylula";
import { signInPath } from "@/lib/auth/redirect";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { useWorkspace } from "./PrayerWorkspace";
const DRAFT = "miqat.qaylula.v1";
const PENDING = "miqat.qaylula-save.v1";
export function WorkspaceQaylula() {
  const { schedule } = useWorkspace();
  // The public provider exposes civil clocks; the shared resolver consumes instants.
  let instants: DailyPrayerSchedule | null = null;
  try {
    if (schedule) instants = resolveDailyPrayerInstants(schedule);
  } catch {
    // Do not invent an anchor if the provider supplies an invalid/ambiguous timetable.
  }
  return <QaylulaCard schedule={instants} />;
}
export function QaylulaCard({ schedule }: { schedule: DailyPrayerSchedule | null }) {
  const { t, intl } = useI18n();
  const router = useRouter();
  const [config, setConfig] = useState<QaylulaConfig>(DEFAULT_QAYLULA);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [proRequired, setProRequired] = useState(false);
  const resumed = useRef(false);
  const saving = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT);
      if (raw && raw.length < 1024) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore validated device-only preferences.
        setConfig(parseQaylula(JSON.parse(raw)));
      }
    } catch {
      /* Invalid drafts never enter the routine resolver. */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) {
      try {
        sessionStorage.setItem(DRAFT, JSON.stringify(config));
      } catch {
        /* Browser storage is optional. */
      }
    }
  }, [loaded, config]);
  const save = useCallback(
    async (value: QaylulaConfig) => {
      if (saving.current) return;
      saving.current = true;
      setBusy(true);
      setMessage("");
      setProRequired(false);
      try {
        const valid = parseQaylula(value);
        const account = await fetch("/api/account/routines", { cache: "no-store" });
        if (account.status === 401) {
          sessionStorage.setItem(PENDING, JSON.stringify(valid));
          router.push(signInPath("/sixth?routine=qaylula#qaylula"));
          return;
        }
        if (account.status === 403) {
          setProRequired(true);
          return;
        }
        if (!account.ok) throw new Error("Qaylula could not be saved. Please retry.");
        const data = await account.json();
        if (!Array.isArray(data.routines))
          throw new Error("Qaylula could not be saved. Please retry.");
        const existingRoutines = data.routines.filter(
          (r: { type?: string }) => r.type === "qaylula",
        );
        if (existingRoutines.length > 1) {
          setMessage("You have multiple Qaylula routines. Choose one to edit in Automations.");
          return;
        }
        const existing = existingRoutines[0];
        const payload = qaylulaRoutine(valid);
        // Keep the existing account's calendar/reminder preferences; this editor does not enable automation.
        if (existing) {
          payload.name = existing.name;
          payload.calendarSyncEnabled = existing.calendar_sync_enabled === true;
          payload.notificationMinutes = existing.notification_minutes ?? null;
          payload.recurrence = existing.recurrence;
          payload.weekdays = existing.weekdays;
        }
        const response = await fetch(
          `/api/account/routines${existing ? `?id=${encodeURIComponent(existing.id)}` : ""}`,
          {
            method: existing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) throw new Error("Qaylula could not be saved. Please retry.");
        sessionStorage.removeItem(PENDING);
        setMessage("Qaylula saved to your account.");
      } catch {
        setMessage("Qaylula could not be saved. Please retry.");
      } finally {
        saving.current = false;
        setBusy(false);
      }
    },
    [router],
  );
  useEffect(() => {
    if (!loaded || new URLSearchParams(location.search).get("routine") !== "qaylula") return;
    const timer = window.setTimeout(() => {
      if (resumed.current) return;
      resumed.current = true;
      try {
        const raw = sessionStorage.getItem(PENDING);
        if (!raw || raw.length > 1024) return;
        const valid = parseQaylula(JSON.parse(raw));
        setConfig(valid);
        void save(valid);
      } catch {
        setMessage("Your saved draft is invalid. Please configure Qaylula again.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loaded, save]);
  let occurrence = null;
  let previewError = "";
  try {
    if (schedule) occurrence = resolveQaylula(config, schedule);
  } catch {
    previewError = "Qaylula preview is unavailable for this prayer schedule.";
  }
  const time = (value: string) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: schedule!.timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  return (
    <section id="qaylula" className="app-card" aria-labelledby="qaylula-title">
      <h2 id="qaylula-title">{t("Qaylula")}</h2>
      <p>
        {t(
          "Choose your own rest window before or after Dhuhr. This is a personal scheduling choice.",
        )}
      </p>
      <div className="product-form">
        <label>
          {t("Anchor")}
          <input value={t("Dhuhr")} readOnly />
        </label>
        <label>
          {t("When")}
          <select
            value={config.relation}
            onChange={(e) =>
              setConfig({ ...config, relation: e.target.value as QaylulaConfig["relation"] })
            }
          >
            <option value="before">{t("Before Dhuhr")}</option>
            <option value="after">{t("After Dhuhr")}</option>
          </select>
        </label>
        <label>
          {t("Offset (minutes)")}
          <input
            type="number"
            min={0}
            max={1440}
            step={1}
            list="qaylula-offsets"
            value={config.offsetMinutes}
            onChange={(e) => {
              const offsetMinutes = e.target.valueAsNumber;
              if (Number.isInteger(offsetMinutes) && offsetMinutes >= 0 && offsetMinutes <= 1440)
                setConfig({ ...config, offsetMinutes });
            }}
          />
        </label>
        <datalist id="qaylula-offsets">
          {[0, 5, 10, 15, 20, 30, 45, 60].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <label>
          {t("Duration (minutes)")}
          <input
            type="number"
            min={1}
            max={1440}
            step={1}
            list="qaylula-durations"
            value={config.durationMinutes}
            onChange={(e) => {
              const durationMinutes = e.target.valueAsNumber;
              if (
                Number.isInteger(durationMinutes) &&
                durationMinutes >= 1 &&
                durationMinutes <= 1440
              )
                setConfig({ ...config, durationMinutes });
            }}
          />
        </label>
        <datalist id="qaylula-durations">
          {[10, 15, 20, 30, 45, 60, 90].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <label>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
          {t("Enabled")}
        </label>
      </div>
      <div aria-live="polite">
        {occurrence ? (
          <p>
            <strong>{t("Preview")}: </strong>
            <bdi>
              {time(occurrence.start)} – {time(occurrence.end)}
            </bdi>{" "}
            · <bdi>{schedule!.timeZone}</bdi>
            <br />
            <bdi>
              {new Intl.DateTimeFormat(intl, {
                timeZone: schedule!.timeZone,
                dateStyle: "medium",
              }).formatRange(new Date(occurrence.start), new Date(occurrence.end))}
            </bdi>
            <br />
            {t("Dhuhr")}: <bdi>{time(schedule!.dhuhr)}</bdi>
          </p>
        ) : (
          <p>
            {t(
              previewError ||
                (!config.enabled
                  ? "Qaylula is disabled."
                  : "Calculate a full prayer timetable to preview Qaylula. Manual night boundaries do not provide Dhuhr."),
            )}
          </p>
        )}
      </div>
      <div className="form-actions">
        <button disabled={busy || !loaded} onClick={() => void save(config)}>
          {t(busy ? "Saving…" : "Save Qaylula to account")}
        </button>
        <Link href="/app/settings?intent=sync#calendar">{t("Sync Calendar")}</Link>
        <Link href="/app/automations">{t("Enable Reminders")}</Link>
        <Link href="/app/automations#routines">{t("Manage saved routines")}</Link>
      </div>
      {message && <p role="status">{t(message)}</p>}
      {proRequired && (
        <p role="status">
          {t("Advanced routines are available with Miqāt Pro.")}{" "}
          <Link href="/pricing?upgrade=1">{t("Upgrade")}</Link>
        </p>
      )}
      <p>
        {t(
          "Temporary settings stay in this browser tab. Account routines require Pro. Calendar automation remains subject to existing rollout restrictions.",
        )}
      </p>
    </section>
  );
}
