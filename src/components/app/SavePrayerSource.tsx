"use client";
import { T } from "@/components/i18n/LocaleProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signInPath } from "@/lib/auth/redirect";
import { useWorkspace } from "./PrayerWorkspace";
import type { PrayerPreferences } from "@/lib/product/settings";

const PENDING_SAVE = "miqat.pending-prayer-save.v1";

/** Resume only an explicitly requested save, never a calculation or ordinary visit. */
export function SavePrayerSource() {
  const { syncContext, result } = useWorkspace();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const resumed = useRef(false);
  const [pending, setPending] = useState<PrayerPreferences | null>(null);
  const save = useCallback(
    async (prayer: PrayerPreferences) => {
      setBusy(true);
      setMessage("");
      try {
        const account = await fetch("/api/account/preferences", { cache: "no-store" });
        if (account.status === 401) {
          // Do not leave for authentication if browser storage cannot preserve this action.
          sessionStorage.setItem(PENDING_SAVE, JSON.stringify(prayer));
          router.push(signInPath("/sixth?save=1"));
          return;
        }
        if (!account.ok) throw new Error("Your account settings could not be loaded. Try again.");
        const current = await account.json();
        const response = await fetch("/api/account/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prayer, revision: current.settings.revision }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Settings could not be saved.");
        sessionStorage.removeItem(PENDING_SAVE);
        setPending(null);
        setMessage("Prayer source saved to your Miqāt account.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Settings could not be saved.");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("save") !== "1") return;
    const timer = window.setTimeout(() => {
      if (resumed.current) return;
      resumed.current = true;
      try {
        const raw = sessionStorage.getItem(PENDING_SAVE);
        if (!raw || raw.length > 4096) return;
        // The existing account API validates the complete source and timezone before writing.
        const prayer = JSON.parse(raw) as PrayerPreferences;
        if (
          !prayer ||
          typeof prayer !== "object" ||
          !prayer.source ||
          typeof prayer.timezone !== "string"
        )
          return;
        setPending(prayer);
        void save(prayer);
      } catch {
        setMessage("Your pending save could not be restored. Calculate again and retry saving.");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [save]);
  return (
    <>
      {(pending || (syncContext && result)) && (
        <button
          disabled={busy}
          onClick={() =>
            void save(pending ?? { source: syncContext!.source, timezone: result!.input.timeZone })
          }
        >
          <T>{busy ? "Saving…" : "Save prayer source to account"}</T>
        </button>
      )}
      {message && (
        <p role="status">
          <T>{message}</T>
        </p>
      )}
    </>
  );
}
