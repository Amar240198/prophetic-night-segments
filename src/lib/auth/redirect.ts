const SAFE_INTERNAL_PREFIXES = ["/app", "/pricing", "/sixth"] as const;

export function safeInternalPath(value: string | null | undefined, fallback = "/app") {
  if (!value || value.length > 512 || value.includes("\\") || /[\u0000-\u001f]/.test(value))
    return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://miqat.invalid");
    if (
      !SAFE_INTERNAL_PREFIXES.some(
        (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`),
      )
    )
      return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function signInPath(destination: string) {
  return `/sign-in?next=${encodeURIComponent(safeInternalPath(destination))}`;
}

export function accountPrompt(destination: string) {
  const path = safeInternalPath(destination);
  if (path.startsWith("/sixth?routine=qaylula"))
    return "Sign in to save Qaylula to your Miqāt account.";
  if (path.startsWith("/sixth?save=1"))
    return "Sign in to save this prayer source to your Miqāt account.";
  if (path.startsWith("/pricing")) return "Sign in to upgrade your Miqāt plan.";
  if (path.startsWith("/app/automations")) return "Sign in to enable reminders.";
  if (path.includes("#calendar") || path.startsWith("/app/calendar"))
    return "Sign in to sync Miqāt with your calendar.";
  if (path.startsWith("/app/settings")) return "Sign in to save settings to your Miqāt account.";
  return "Sign in to access your Miqāt account.";
}
