"use client";
import { T } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { accountPrompt, safeInternalPath } from "@/lib/auth/redirect";
export function AuthForm({ mode }: { mode: "signin" | "signup" | "reset" }) {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/app");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read the browser return path after matching the server's first render.
    setNextPath(safeInternalPath(new URLSearchParams(location.search).get("next")));
  }, []);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [forgot, setForgot] = useState(false);
  return (
    <main className="auth-page app-content">
      <Link className="wordmark" href="/">
        <T>{"MIQĀT"}</T>
      </Link>
      <h1>
        <T>
          {forgot
            ? "Reset your password"
            : mode === "signup"
              ? "Create your account"
              : mode === "reset"
                ? "Choose a new password"
                : "Sign in"}
        </T>
      </h1>
      {mode !== "reset" && !forgot && (
        <p>
          <T>{accountPrompt(nextPath)}</T>
        </p>
      )}
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
            router.push(mode === "reset" ? "/sign-in" : nextPath);
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
            <T>{"Email"}</T>
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
        )}
        {!forgot && (
          <label>
            <T>{"Password"}</T>
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
        {message && (
          <p role="status">
            <T>{message}</T>
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          <T>
            {busy
              ? "Please wait…"
              : forgot
                ? "Request password reset"
                : mode === "signup"
                  ? "Create account"
                  : mode === "reset"
                    ? "Save new password"
                    : "Sign in"}
          </T>
        </button>
      </form>
      {mode === "signin" && (
        <button onClick={() => setForgot(!forgot)}>
          <T>{forgot ? "Back to sign in" : "Forgot password?"}</T>
        </button>
      )}
      <p>
        <Link
          href={
            mode === "signup"
              ? `/sign-in?next=${encodeURIComponent(nextPath)}`
              : `/sign-up?next=${encodeURIComponent(nextPath)}`
          }
        >
          <T>{mode === "signup" ? "Already have an account? Sign in" : "Create an account"}</T>
        </Link>
      </p>
      <p>
        <T>{"By creating an account you agree to the "}</T>
        <Link href="/terms">
          <T>{"Terms"}</T>
        </Link>
        <T>{" and acknowledge the"}</T>{" "}
        <Link href="/privacy">
          <T>{"Privacy policy"}</T>
        </Link>
        .
      </p>
    </main>
  );
}
