"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AuthForm({ mode }: { mode: "signin" | "signup" | "reset" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [forgot, setForgot] = useState(false);
  return (
    <main className="auth-page app-content">
      <Link className="wordmark" href="/">
        MIQĀT
      </Link>
      <h1>
        {forgot
          ? "Reset your password"
          : mode === "signup"
            ? "Create your account"
            : mode === "reset"
              ? "Choose a new password"
              : "Sign in"}
      </h1>
      <form
        className="product-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          const data = new FormData(e.currentTarget);
          try {
            const response = await fetch(
              `/api/auth/${forgot ? "forgot-password" : mode === "reset" ? "reset-password" : mode}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: data.get("email"),
                  password: data.get("password"),
                  token:
                    mode === "reset"
                      ? new URLSearchParams(location.search).get("token")
                      : undefined,
                }),
              },
            );
            const body = await response.json();
            if (!response.ok)
              throw new Error(body.error?.message ?? "This request could not be completed.");
            if (forgot) {
              setMessage(body.message);
              return;
            }
            router.push(mode === "reset" ? "/sign-in" : "/app");
            router.refresh();
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode !== "reset" && (
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
        )}
        {!forgot && (
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={200}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
            />
          </label>
        )}
        {message && <p role="status">{message}</p>}
        <button className="primary-button" disabled={busy}>
          {busy
            ? "Please wait…"
            : forgot
              ? "Request password reset"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Save new password"
                  : "Sign in"}
        </button>
      </form>
      {mode === "signin" && (
        <button onClick={() => setForgot(!forgot)}>
          {forgot ? "Back to sign in" : "Forgot password?"}
        </button>
      )}
      <p>
        <Link href={mode === "signup" ? "/sign-in" : "/sign-up"}>
          {mode === "signup" ? "Already have an account? Sign in" : "Create an account"}
        </Link>
      </p>
      <p>
        By creating an account you agree to the <Link href="/terms">Terms</Link> and acknowledge the{" "}
        <Link href="/privacy">Privacy policy</Link>.
      </p>
    </main>
  );
}
