"use client";
import { T, useI18n } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
export const navigation = [
  ["/app", "Today"],
  ["/app/calendar", "Calendar"],
  ["/app/automations", "Automations"],
  ["/app/settings", "Settings"],
  ["/app/account", "Account"],
] as const;
export function AppShell({ children, plan }: { children: ReactNode; plan?: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const links = navigation.map(([href, label]) => (
    <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
      <T>{label}</T>
    </Link>
  ));
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        <T>{"Skip to content"}</T>
      </a>
      <aside className="app-sidebar">
        <Link className="wordmark" href="/">
          MIQĀT
        </Link>
        <nav aria-label={t("Desktop navigation")}>{links}</nav>
        <div className="sidebar-bottom">
          <span className="status-badge">
            {plan === undefined || plan === "FREE" ? (
              <T>{"Free"}</T>
            ) : plan === "PRO" ? (
              <T>{"Miqāt Pro"}</T>
            ) : (
              plan
            )}
          </span>
          <Link href="/sixth">
            <T>{"Free Sixth calculator"}</T>
          </Link>
        </div>
      </aside>
      <div className="app-body">
        <main id="main-content" className="app-content">
          {children}
        </main>
      </div>
      <nav className="mobile-nav" aria-label={t("Mobile navigation")}>
        {links}
      </nav>
    </div>
  );
}
