"use client";
import { formatPlanPrice } from "@/lib/billing/plans";
import Link from "next/link";
export function Paywall({ title = "Calendar intelligence" }: { title?: string }) {
  return (
    <section className="app-card">
      <p className="eyebrow">MIQĀT PRO</p>
      <h2>{title}</h2>
      <p>Connect your calendar and Miqāt will find prayer windows around your real schedule.</p>
      <Link className="primary-button" href="/pricing">
        Explore Miqāt Pro — {formatPlanPrice()}
      </Link>
    </section>
  );
}
