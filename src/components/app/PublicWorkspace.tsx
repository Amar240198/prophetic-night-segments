"use client";
import { T, useI18n } from "@/components/i18n/LocaleProvider";
import { WorkspaceQaylula } from "./QaylulaCard";
import { SavePrayerSource } from "./SavePrayerSource";
import Link from "next/link";
import { PrayerWorkspace } from "./PrayerWorkspace";
import { SixthPage, PrayersPage } from "./PrayerPages";

export function PublicWorkspace() {
  const { t } = useI18n();
  return (
    <PrayerWorkspace>
      <SixthPage />
      <PrayersPage showSettings={false} />
      <WorkspaceQaylula />
      <section className="app-card" aria-label={t("Account features")}>
        <p>
          <T>{"Your calculations are free. Account features use your Miqāt account."}</T>
        </p>
        <div className="form-actions">
          <SavePrayerSource />
          <Link href="/app/settings">
            <T>{"Save settings to account"}</T>
          </Link>
          <Link href="/app/settings?intent=sync#calendar">
            <T>{"Sync Calendar"}</T>
          </Link>
          <Link href="/app/automations">
            <T>{"Enable Reminders"}</T>
          </Link>
          <Link href="/pricing?upgrade=1">
            <T>{"Upgrade"}</T>
          </Link>
        </div>
      </section>
    </PrayerWorkspace>
  );
}
