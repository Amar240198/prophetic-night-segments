"use client";
import { useEffect } from "react";
import Link from "next/link";
import { GOOGLE_MESSAGES, type GoogleErrorCode } from "@/lib/google-calendar/errors";

export function GoogleCalendarCompletion({ status }: { status: string }) {
  const safeStatus =
    status === "connected" || Object.hasOwn(GOOGLE_MESSAGES, status) ? status : "CONNECTION_FAILED";
  const message =
    safeStatus === "connected"
      ? "Google Calendar connected. You can close this window and return to your Qiyam plan."
      : GOOGLE_MESSAGES[safeStatus as GoogleErrorCode];
  useEffect(() => {
    window.opener?.postMessage(
      { type: "pns-google-calendar", status: safeStatus },
      window.location.origin,
    );
    if (window.opener) window.close();
  }, [safeStatus]);
  return (
    <main className="mx-auto max-w-xl p-8 text-[#c8d4d0]">
      <h1 className="font-serif text-3xl">Google Calendar</h1>
      <p role="status" className="mt-5">
        {message}
      </p>
      <Link className="mt-5 inline-block text-[#d0ae67] underline" href="/">
        Return to Prophetic Night Segments
      </Link>
    </main>
  );
}
