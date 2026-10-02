"use client";
import { PRAYER_LABELS } from "@/lib/i18n/labels";
import { T } from "@/components/i18n/LocaleProvider";
import {
  ALADHAN_CALCULATION_METHODS,
  type AlAdhanCalculationMethod,
} from "@/lib/providers/aladhan";
import Link from "next/link";
import { useProduct } from "../product/ProductContext";
import { CalendarExperience } from "../product/CalendarExperience";
import { QaylulaCard } from "./QaylulaCard";
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
          day ? (
            <time dateTime={day.night.night.start}>
              {new Intl.DateTimeFormat("en-GB", {
                dateStyle: "full",
                timeZone: day.timezone,
              }).format(new Date(day.night.night.start))}
            </time>
          ) : (
            "Your day around Salah"
          )
        }
      />
      {state?.settings.onboarding !== "complete" && (
        <p>
          <Link href="/app/onboarding">
            <T>{"Finish setup"}</T>
          </Link>
          <T>{" — keep your existing settings and complete what is missing."}</T>
        </p>
      )}
      {error && (
        <p role="alert">
          <T>{error}</T>
        </p>
      )}
      {dayError && (
        <p role="alert">
          <T>{dayError}</T>{" "}
          <button onClick={() => void reloadDay()}>
            <T>{"Try again"}</T>
          </button>{" "}
          <Link href="/sixth">
            <T>{"Free manual calculator"}</T>
          </Link>
        </p>
      )}
      {!day && !dayError && (
        <p role="status">
          <T>
            {state && !state.settings.configured
              ? "Confirm your prayer settings to see your day."
              : "Loading prayer times…"}
          </T>
        </p>
      )}
      <QaylulaCard schedule={day?.schedule ?? null} />
      {day && (
        <>
          <Card title="Your prayer day">
            <p>
              {state?.settings.prayer.source.kind === "aladhan" ? (
                <bdi>{`${state.settings.prayer.source.options.city}, ${state.settings.prayer.source.options.country}`}</bdi>
              ) : (
                <T>{"Your precise location"}</T>
              )}{" "}
              · {day.timezone}
            </p>
            <p>
              {day.schedule?.source}
              <T>{" · Calculation method"}</T>{" "}
              {ALADHAN_CALCULATION_METHODS[
                (state?.settings.prayer.source.kind === "aladhan"
                  ? state.settings.prayer.source.options.calculationMethod
                  : (state?.settings.prayer.source.calculationMethod ??
                    3)) as AlAdhanCalculationMethod
              ] ?? "Saved calculation method"}{" "}
              ·{" "}
              <Link href="/app/settings">
                <T>{"Change in Settings"}</T>
              </Link>
            </p>
            {day.schedule ? (
              <ol className="day-timeline">
                {(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const).map((prayer) => (
                  <li key={prayer}>
                    <time>{time(day.schedule![prayer])}</time>
                    <strong className="capitalize">
                      <T>{PRAYER_LABELS[prayer]}</T>
                      <T>{prayer === "sunrise" ? " · Sunrise (informational)" : ""}</T>
                    </strong>
                  </li>
                ))}
              </ol>
            ) : (
              <p>
                <T>{"This saved provider supplies night boundaries only."}</T>{" "}
                <Link href="/app/settings">
                  <T>{"Review prayer settings"}</T>
                </Link>
                <T>{" to load the full prayer day."}</T>
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
                  <dt>
                    <T>{label}</T>
                  </dt>
                  <dd>{time(value)}</dd>
                </div>
              ))}
            </dl>
            <p>
              <T>{"Qiyām:"}</T>{" "}
              <T>
                {state?.settings.automation.modules.includes("night")
                  ? state.settings.automation.night === "dawud"
                    ? "Dāwūd prayer period · Parts 4–5"
                    : state.settings.automation.qiyamWindow === "final-sixth"
                      ? "Final sixth"
                      : "Last third"
                  : "Not scheduled"}
              </T>
            </p>
            <p>
              <T>
                {day.fasting.length
                  ? "Fasting today according to your saved programme."
                  : "No fast scheduled today."}
              </T>
            </p>
            <div className="form-actions">
              <Link href="/app/automations">
                <T>{"Manage automation"}</T>
              </Link>
              <Link href="/sixth">
                <T>{"Detailed Sixth of the Night calculator"}</T>
              </Link>
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
      <Link href="/app/settings#calendar">
        <T>{"Manage calendar connection in Settings"}</T>
      </Link>
    </p>
  );
}
