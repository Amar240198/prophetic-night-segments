"use client";
import { T } from "@/components/i18n/LocaleProvider";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
export function BillingButton({
  action = "checkout",
  children,
  autoStart = false,
}: {
  action?: "checkout" | "portal";
  children: React.ReactNode;
  autoStart?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  const started = useRef(false);
  const openBilling = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/billing/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (response.status === 401) {
        const next = action === "checkout" ? "/pricing?upgrade=1" : "/app/account";
        router.push(`/sign-in?next=${encodeURIComponent(next)}`);
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Billing is unavailable.");
      const url = new URL(body.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw new Error("Invalid billing destination.");
      window.location.assign(url.toString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [action, router]);
  useEffect(() => {
    if (!autoStart || started.current || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("upgrade") !== "1") return;
    const timer = window.setTimeout(() => {
      if (started.current) return;
      started.current = true;
      void openBilling();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, openBilling]);
  return (
    <>
      <button className="primary-button" disabled={busy} onClick={() => void openBilling()}>
        <T>{busy ? "Opening secure billing…" : children}</T>
      </button>
      {error && (
        <p role="alert">
          <T>{error}</T>
        </p>
      )}
    </>
  );
}
