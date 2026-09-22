"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function BillingSuccess() {
  const [message, setMessage] = useState("Confirming your subscription…");
  const [active, setActive] = useState(false);
  useEffect(() => {
    let disposed = false,
      attempts = 0;
    async function check() {
      try {
        const r = await fetch("/api/billing/status", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const body = await r.json();
        if (!disposed && body.plan === "PRO") {
          setActive(true);
          setMessage("Miqāt Pro is ready.");
          return true;
        }
      } catch {
        if (!disposed) setMessage("Sign in to check your subscription status.");
      }
      return false;
    }
    void check();
    const timer = setInterval(() => {
      if (++attempts > 10) {
        clearInterval(timer);
        if (!disposed)
          setMessage(
            "Activation is taking a little longer. You can check Account or refresh billing status there.",
          );
        return;
      }
      void check().then((ok) => {
        if (ok) clearInterval(timer);
      });
    }, 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <main className="landing">
      <h1>{active ? "Welcome to Miqāt Pro" : "Activating Miqāt Pro"}</h1>
      <p role="status">{message}</p>
      <Link className="primary-button" href={active ? "/app/onboarding" : "/app/account"}>
        {active ? "Continue setup" : "Open Account"}
      </Link>
    </main>
  );
}
