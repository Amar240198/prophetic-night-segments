"use client";
import { useEffect, useState } from "react";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { Card } from "./ui";
export function AutomationTimeline() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [message, setMessage] = useState("Loading your saved schedule…");
  useEffect(() => {
    let active = true;
    fetch("/api/google-calendar/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preview", days: 1 }),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Your account schedule is unavailable. Check Calendar settings.");
        const body = await response.json();
        if (!Array.isArray(body.events))
          throw new Error("Configure your calendar automation to see the combined schedule.");
        if (active) {
          setEvents(body.events);
          setMessage(
            body.issues?.length ? "Some routines need a configured anchor or prayer source." : "",
          );
        }
      })
      .catch((error: Error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Card title="Your Islamic calendar today">
      {message && <p role="status">{message}</p>}
      {events.length ? (
        <ol className="summary-list">
          {events.map((event) => (
            <li key={`${event.id}/${event.serviceDate}`}>
              <time dateTime={event.start}>
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: event.timeZone,
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(event.start))}
              </time>{" "}
              · {event.title}
            </li>
          ))}
        </ol>
      ) : (
        !message && (
          <p>No enabled events today. Choose routines and modules in Calendar settings.</p>
        )
      )}
    </Card>
  );
}
