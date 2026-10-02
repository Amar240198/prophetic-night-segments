"use client";
import { T } from "@/components/i18n/LocaleProvider";
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
      {error && (
        <p role="alert">
          <T>{error}</T>
        </p>
      )}
      {state ? (
        <>
          <Card title="Prayer settings">
            {state.settings.sourceReviewRequired && (
              <p role="status">
                <T>
                  {
                    "Your previous timetable is no longer supported. Automation is paused. Review and explicitly save a replacement calculation method; your existing calendar events have not been changed."
                  }
                </T>
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
              <T>
                {
                  "Only your selected calendars are analysed. Disconnecting stops access and leaves your existing events unchanged."
                }
              </T>
            </p>
            <Link href="/privacy">
              <T>{"How Miqāt uses your data"}</T>
            </Link>
          </Card>
        </>
      ) : (
        <p role="status">
          <T>{"Loading settings…"}</T>
        </p>
      )}
    </>
  );
}
