"use client";
import {
  ALADHAN_CALCULATION_METHODS,
  type AlAdhanCalculationMethod,
} from "@/lib/providers/aladhan";
import Link from "next/link";
import { useProduct } from "../product/ProductContext";
import { CalendarExperience } from "../product/CalendarExperience";
import { PageHeader, Card } from "./ui";
export function TodayPage() {
  const { state, day, dayError, error, reloadDay } = useProduct();
  const time = (v: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: day?.timezone ?? "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(v));
  return (
    <>
      <PageHeader
        title="Today"
        description={
          day
            ? new Intl.DateTimeFormat("en-GB", {
                dateStyle: "full",
                timeZone: day.timezone,
              }).format(new Date(day.night.night.start))
            : "Your day around Salah"
        }
      />
      {state?.settings.onboarding !== "complete" && (
        <p>
          <Link href="/app/onboarding">Finish setup</Link> — keep your existing settings and
          complete what is missing.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {dayError && (
        <p role="alert">
          {dayError} <button onClick={() => void reloadDay()}>Try again</button>{" "}
          <Link href="/sixth">Free manual calculator</Link>
        </p>
      )}
      {!day && !dayError && (
        <p role="status">
          {state && !state.settings.configured
            ? "Confirm your prayer settings to see your day."
            : "Loading prayer times…"}
        </p>
      )}
      {day && (
        <>
          <Card title="Your prayer day">
            <p>
              {state?.settings.prayer.source.kind === "aladhan"
                ? `${state.settings.prayer.source.options.city}, ${state.settings.prayer.source.options.country}`
                : "Your precise location"}{" "}
              · {day.timezone}
            </p>
            <p>
              {day.schedule?.source} · Calculation method{" "}
              {ALADHAN_CALCULATION_METHODS[
                (state?.settings.prayer.source.kind === "aladhan"
                  ? state.settings.prayer.source.options.calculationMethod
                  : (state?.settings.prayer.source.calculationMethod ??
                    3)) as AlAdhanCalculationMethod
              ] ?? "Saved calculation method"}{" "}
              · <Link href="/app/settings">Change in Settings</Link>
            </p>
            {day.schedule ? (
              <ol className="day-timeline">
                {(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const).map((prayer) => (
                  <li key={prayer}>
                    <time>{time(day.schedule![prayer])}</time>
                    <strong className="capitalize">
                      {prayer}
                      {prayer === "sunrise" ? " · Sunrise (informational)" : ""}
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                This saved provider supplies night boundaries only.{" "}
                <Link href="/app/settings">Review prayer settings</Link> to load the full prayer
                day.
              </p>
            )}
          </Card>
          <CalendarExperience />
          <Card title="Tonight and worship">
            <dl className="summary-list">
              {[
                ["Midpoint", day.night.midpoint],
                ["Last third", day.night.lastThird.start],
                ["Final sixth", day.night.dawudPattern.finalSleep.start],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{time(value)}</dd>
                </div>
              ))}
            </dl>
            <p>
              Qiyām:{" "}
              {state?.settings.automation.modules.includes("night")
                ? state.settings.automation.night === "dawud"
                  ? "Dāwūd prayer period · Parts 4–5"
                  : state.settings.automation.qiyamWindow === "final-sixth"
                    ? "Final sixth"
                    : "Last third"
                : "Not scheduled"}
            </p>
            <p>
              {day.fasting.length
                ? "Fasting today according to your saved programme."
                : "No fast scheduled today."}
            </p>
            <div className="form-actions">
              <Link href="/app/automations">Manage automation</Link>
              <Link href="/sixth">Detailed Sixth of the Night calculator</Link>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
export function CalendarSummary() {
  return (
    <p>
      <Link href="/app/settings#calendar">Manage calendar connection in Settings</Link>
    </p>
  );
}
