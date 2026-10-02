"use client";
import { T } from "@/components/i18n/LocaleProvider";
import { formatPlanPrice } from "@/lib/billing/plans";
import Link from "next/link";
export function Paywall({ title = "Calendar intelligence" }: { title?: string }) {
  return (
    <section className="app-card">
      <p className="eyebrow">
        <T>{"MIQĀT PRO"}</T>
      </p>
      <h2>
        <T>{title}</T>
      </h2>
      <p>
        <T>
          {"Connect your calendar and Miqāt will find prayer windows around your real schedule."}
        </T>
      </p>
      <Link className="primary-button" href="/pricing">
        <T>{"Explore Miqāt Pro — "}</T>
        {formatPlanPrice()}
      </Link>
    </section>
  );
}
