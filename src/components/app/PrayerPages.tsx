"use client";
import { useWorkspace } from "./PrayerWorkspace";
import { PageHeader, EmptyState } from "./ui";
export function SixthPage() {
  const { settings, night, result } = useWorkspace();
  return (
    <>
      <PageHeader
        title="Sixth of the Night"
        description="Maghrib to following Fajr. Understand the night, then plan your prayer and rest."
      />
      {result && (
        <section className="app-card" aria-label="Six night boundaries">
          <h2>
            Tonight · {Math.floor(result.night.durationMilliseconds / 3600000)}h{" "}
            {Math.round(result.night.durationMilliseconds / 60000) % 60}m
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
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
      <details className="settings-panel" open={!result}>
        <summary>Prayer source and night settings</summary>
        {settings}
      </details>
      {night}
    </>
  );
}
export function PrayersPage() {
  const { settings, prayers } = useWorkspace();
  return (
    <>
      <PageHeader
        title="All Prayers"
        description="Your daily prayers and calendar schedule. Sunrise is informational only."
      />
      {prayers ?? (
        <EmptyState>Choose your prayer source and calculate to load the timetable.</EmptyState>
      )}
      <details className="settings-panel" open={!prayers}>
        <summary>Prayer source, location and timezone</summary>
        {settings}
      </details>
    </>
  );
}
