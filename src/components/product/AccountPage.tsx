"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useProduct, productApi } from "./ProductContext";
import { BillingButton } from "./BillingButton";
import { formatPlanPrice } from "@/lib/billing/plans";
import { Card, PageHeader } from "../app/ui";
export function AccountPage() {
  const { state, refresh } = useProduct();
  const [message, setMessage] = useState("");
  const router = useRouter();
  if (!state) return <p role="status">Loading account…</p>;
  const sub = state.entitlements.subscription;
  return (
    <>
      <PageHeader title="Account" description="Your identity, security and subscription." />
      <Card title="Profile">
        <p>{state.user.email}</p>
        <button
          onClick={async () => {
            try {
              await productApi("/api/auth/signout", {}, "POST");
              router.push("/sign-in");
              router.refresh();
            } catch {
              setMessage("Sign out failed. Try again.");
            }
          }}
        >
          Sign out
        </button>
      </Card>
      <Card title="Your plan">
        <h3>{state.entitlements.plan === "PRO" ? "Miqāt Pro" : "Free"}</h3>
        {state.entitlements.plan === "PRO" && (
          <>
            <p>{formatPlanPrice()}</p>
            <p>
              {sub.cancelAtPeriodEnd ? "Access continues until" : "Current billing period ends"}:{" "}
              {sub.currentPeriodEnd
                ? new Date(String(sub.currentPeriodEnd)).toLocaleDateString("en-GB")
                : "Check billing details"}
            </p>
          </>
        )}
        {sub.status === "past_due" && (
          <p>Your payment needs attention. Update your payment method to restore Pro access.</p>
        )}
        {sub.customer ? (
          <BillingButton action="portal">Manage billing</BillingButton>
        ) : (
          <BillingButton>Upgrade to Miqāt Pro — {formatPlanPrice()}</BillingButton>
        )}
        {sub.customer &&
          state.entitlements.plan === "FREE" &&
          ["canceled", "expired", "incomplete_expired"].includes(sub.status) && (
            <BillingButton>Upgrade to Miqāt Pro — {formatPlanPrice()}</BillingButton>
          )}
        <button
          onClick={async () => {
            try {
              await productApi("/api/billing/reconcile", {}, "POST");
              await refresh();
              setMessage("Subscription status refreshed.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Refresh billing status
        </button>
        <p>
          <Link href="/pricing">Compare plans</Link>
        </p>
      </Card>
      <Card title="Security">
        <Link href="/sign-in">Request a password reset</Link>
      </Card>
      <Card title="Your data">
        <button
          onClick={async () => {
            try {
              const exported = await productApi("/api/account/export");
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "miqat-data.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Export account data
        </button>
        <p>
          <Link href="/privacy">Data retention and deletion information</Link>
        </p>
      </Card>
      {message && <p role="status">{message}</p>}
    </>
  );
}
