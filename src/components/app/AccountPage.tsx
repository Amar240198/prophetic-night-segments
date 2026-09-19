"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { AppUser } from "@/lib/auth/session.server";
import { useWorkspace } from "./PrayerWorkspace";
import { CalendarSummary } from "./TodayPage";
import { Card, PageHeader, StatusBadge } from "./ui";
export function AccountPage({ user }: { user: AppUser | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const { settings } = useWorkspace();
  const [signup, setSignup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function authenticate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const response = await fetch(`/api/auth/${signup ? "signup" : "signin"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Sign in failed.");
      const next = params.get("next");
      router.push(
        next && /^\/app(?:\/[a-z]+)?$/.test(next) && next !== "/app/account" ? next : "/app",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  async function signout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/signout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      setError("Sign out failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/account/preferences"),
        fetch("/api/account/routines"),
        fetch("/api/account/automation"),
      ]);
      if (responses.some((r) => !r.ok)) throw new Error();
      const [preferences, routines, automation] = await Promise.all(responses.map((r) => r.json()));
      const data = {
        profile: user,
        preferences,
        routines,
        automation,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "miqat-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Your data could not be exported. Please retry.");
    }
  }
  return (
    <>
      <PageHeader title="Account" description="Your profile, preferences and plan." />
      {error && <p role="alert">{error}</p>}
      {user ? (
        <>
          <Card title="Profile">
            <p>{user.email}</p>
            <StatusBadge>{user.plan}</StatusBadge>
            <div className="form-actions">
              <button className="secondary-button" disabled={busy} onClick={() => void signout()}>
                Sign out
              </button>
            </div>
          </Card>
          <Card title="Subscription">
            <p>Current plan: {user.plan}. Miqāt Pro upgrades are not available yet.</p>
          </Card>
          <details className="settings-panel">
            <summary>Preferences · Prayer source, location and timezone</summary>
            {settings}
          </details>
          <Card title="Calendar connection">
            <CalendarSummary />
          </Card>
          <Card title="Your data">
            <button className="secondary-button" onClick={() => void exportData()}>
              Export my data
            </button>
            <p className="mt-4">Delete account: self-service deletion is not available yet.</p>
          </Card>
        </>
      ) : (
        <Card title={signup ? "Create your account" : "Sign in to Miqāt"}>
          <form className="account-form" onSubmit={authenticate}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={200}
                autoComplete={signup ? "new-password" : "current-password"}
                required
              />
            </label>
            <p>Use at least 12 characters.</p>
            <button className="primary-button" disabled={busy}>
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </button>
          </form>
          <button
            className="module-link"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "Already have an account? Sign in" : "Create a free account"}
          </button>
          <p className="mt-4">
            The free Sixth calculator and basic prayer timetable remain available without an
            account.
          </p>
        </Card>
      )}
    </>
  );
}
