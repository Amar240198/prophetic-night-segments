"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function BillingButton({
  action = "checkout",
  children,
}: {
  action?: "checkout" | "portal";
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  return (
    <>
      <button
        className="primary-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch(`/api/billing/${action}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            });
            if (response.status === 401) {
              router.push("/sign-in");
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
        }}
      >
        {busy ? "Opening secure billing…" : children}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
