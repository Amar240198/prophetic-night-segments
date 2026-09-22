"use client";
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
  const pathname = usePathname();
  const links = navigation.map(([href, label]) => (
    <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
      {label}
    </Link>
  ));
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <Link className="wordmark" href="/">
          MIQĀT
        </Link>
        <nav aria-label="Desktop navigation">{links}</nav>
        <div className="sidebar-bottom">
          <span className="status-badge">{plan ?? "Free"}</span>
          <Link href="/sixth">Free Sixth calculator</Link>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <Link className="wordmark" href="/">
            MIQĀT
          </Link>
          <span>Your day around Salah</span>
        </header>
        <main id="main-content" className="app-content">
          {children}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links}
      </nav>
    </div>
  );
}
