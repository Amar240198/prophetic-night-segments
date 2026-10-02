"use client";
import { T } from "@/components/i18n/LocaleProvider";
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
  if (!state)
    return (
      <p role="status">
        <T>{"Loading account…"}</T>
      </p>
    );
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
          <T>{"Sign out"}</T>
        </button>
      </Card>
      <Card title="Your plan">
        <h3>
          <T>{state.entitlements.plan === "PRO" ? "Miqāt Pro" : "Free"}</T>
        </h3>
        {state.entitlements.plan === "PRO" && (
          <>
            <p>{formatPlanPrice()}</p>
            <p>
              <T>
                {sub.cancelAtPeriodEnd ? "Access continues until" : "Current billing period ends"}
              </T>
              :{" "}
              {sub.currentPeriodEnd ? (
                <time dateTime={String(sub.currentPeriodEnd)}>
                  {new Date(String(sub.currentPeriodEnd)).toLocaleDateString("en-GB")}
                </time>
              ) : (
                <T>{"Check billing details"}</T>
              )}
            </p>
          </>
        )}
        {sub.status === "past_due" && (
          <p>
            <T>
              {"Your payment needs attention. Update your payment method to restore Pro access."}
            </T>
          </p>
        )}
        {sub.customer ? (
          <BillingButton action="portal">
            <T>{"Manage billing"}</T>
          </BillingButton>
        ) : (
          <BillingButton>
            <T>{"Upgrade to Miqāt Pro — "}</T>
            {formatPlanPrice()}
          </BillingButton>
        )}
        {sub.customer &&
          state.entitlements.plan === "FREE" &&
          ["canceled", "expired", "incomplete_expired"].includes(sub.status) && (
            <BillingButton>
              <T>{"Upgrade to Miqāt Pro — "}</T>
              {formatPlanPrice()}
            </BillingButton>
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
          <T>{"Refresh billing status"}</T>
        </button>
        <p>
          <Link href="/pricing">
            <T>{"Compare plans"}</T>
          </Link>
        </p>
      </Card>
      <Card title="Security">
        <Link href="/sign-in">
          <T>{"Request a password reset"}</T>
        </Link>
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
          <T>{"Export account data"}</T>
        </button>
        <p>
          <Link href="/privacy">
            <T>{"Data retention and deletion information"}</T>
          </Link>
        </p>
      </Card>
      {message && (
        <p role="status">
          <T>{message}</T>
        </p>
      )}
    </>
  );
}
