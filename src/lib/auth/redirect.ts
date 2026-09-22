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
