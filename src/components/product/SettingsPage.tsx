"use client";
import Link from "next/link";
import { useProduct } from "./ProductContext";
import { PrayerSettings } from "./PrayerSettings";
import { CalendarSettings } from "./CalendarSettings";
import { Paywall } from "./Paywall";
import { PageHeader, Card } from "../app/ui";
export function SettingsPage() {
  const { state, error, save } = useProduct();
  return (
    <>
      <PageHeader title="Settings" description="Your prayer calculation and calendar connection." />
      {error && <p role="alert">{error}</p>}
      {state ? (
        <>
          <Card title="Prayer settings">
            {state.settings.sourceReviewRequired && (
              <p role="status">
                Your previous timetable is no longer supported. Automation is paused. Review and
                explicitly save a replacement calculation method; your existing calendar events have
                not been changed.
              </p>
            )}
            <PrayerSettings initial={state.settings.prayer} onSave={(prayer) => save({ prayer })} />
          </Card>
          <section id="calendar">
            <Card title="Calendar connection">
              <CalendarSettings canAnalyse={state.entitlements.features["calendar-read"]} />
              {!state.entitlements.features["calendar-read"] && <Paywall />}
            </Card>
          </section>
          <Card title="Privacy">
            <p>
              Only your selected calendars are analysed. Disconnecting stops access and leaves your
              existing events unchanged.
            </p>
            <Link href="/privacy">How Miqāt uses your data</Link>
          </Card>
        </>
      ) : (
        <p role="status">Loading settings…</p>
      )}
    </>
  );
}
