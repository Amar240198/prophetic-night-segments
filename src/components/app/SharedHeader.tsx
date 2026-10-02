"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { locales, parseLocale } from "@/lib/i18n/config";
export function SharedHeader() {
  const { locale, setLocale, t } = useI18n();
  const pathname = usePathname();
  return (
    <header className="app-topbar shared-header">
      <Link className="wordmark" href="/">
        MIQĀT
      </Link>
      <nav aria-label={t("Public navigation")}>
        {pathname?.startsWith("/app") ? (
          <span>{t("Your day around Salah")}</span>
        ) : (
          <>
            <Link href="/app">{t("Open app")}</Link>
            <Link href="/pricing">{t("Pricing")}</Link>
            <Link href="/sign-in">{t("Sign in")}</Link>
          </>
        )}
      </nav>
      <label className="language-picker">
        <span className="sr-only">{t("Language")}</span>
        <select
          aria-label={t("Language")}
          value={locale}
          onChange={(e) => setLocale(parseLocale(e.target.value))}
        >
          {Object.entries(locales).map(([value, item]) => (
            <option key={value} value={value} lang={value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
