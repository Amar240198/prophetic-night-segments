"use client";
import { T, useI18n } from "@/components/i18n/LocaleProvider";
import { useWorkspace } from "./PrayerWorkspace";
import { PageHeader, EmptyState } from "./ui";
export function SixthPage() {
  const { t } = useI18n();
  const { settings, night, result } = useWorkspace();
  return (
    <>
      <PageHeader
        title="Sixth of the Night"
        description="Maghrib to following Fajr. Understand the night, then plan your prayer and rest."
      />
      {result && (
        <section className="app-card" aria-label={t("Six night boundaries")}>
          <h2>
            <T>{"Tonight · "}</T>
            {Math.floor(result.night.durationMilliseconds / 3600000)}
            <T>{"h"}</T> {Math.round(result.night.durationMilliseconds / 60000) % 60}
            <T>{"m"}</T>
          </h2>
          <div className="boundary-grid">
            {result.boundaries.map((boundary, index) => (
              <div key={index}>
                <strong>B{index}</strong>
                <time>
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone: result.input.timeZone,
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(boundary.instant))}
                </time>
                <small>
                  <T>
                    {index === 3
                      ? "Midpoint"
                      : index === 4
                        ? "Last third"
                        : index === 5
                          ? "Final sixth"
                          : index === 0
                            ? "Maghrib"
                            : index === 6
                              ? "Fajr"
                              : ""}
                  </T>
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
      <details className="settings-panel" open={!result}>
        <summary>
          <T>{"Prayer source and night settings"}</T>
        </summary>
        {settings}
      </details>
      {night}
    </>
  );
}
export function PrayersPage({ showSettings = true }: { showSettings?: boolean }) {
  const { settings, prayers } = useWorkspace();
  return (
    <>
      <PageHeader
        title="All Prayers"
        description="Your daily prayers and calendar schedule. Sunrise is informational only."
      />
      {prayers ?? (
        <EmptyState>
          <T>{"Choose your prayer source and calculate to load the timetable."}</T>
        </EmptyState>
      )}
      {showSettings && (
        <details className="settings-panel" open={!prayers}>
          <summary>
            <T>{"Prayer source, location and timezone"}</T>
          </summary>
          {settings}
        </details>
      )}
    </>
  );
}
