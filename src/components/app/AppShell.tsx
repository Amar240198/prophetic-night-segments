"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { StatusBadge } from "./ui";
export const navigation = [
  ["/app", "Today"],
  ["/app/prayers", "All Prayers"],
  ["/app/sixth", "Sixth"],
  ["/app/fasting", "Fasting"],
  ["/app/routines", "Routines"],
  ["/app/calendar", "Calendar"],
] as const;
export function AppShell({ children, plan }: { children: ReactNode; plan?: string }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState<string | null>(null);
  const open = menu === pathname;
  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      onClick={() => setMenu(null)}
    >
      {label}
    </Link>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="app-sidebar">
        <Link href="/" className="wordmark">
          MIQĀT
        </Link>
        <nav aria-label="Desktop navigation">
          {navigation.map(([href, label]) => link(href, label))}
        </nav>
        <div className="future-nav">
          <span>Coming later</span>
          <span>Ramadan</span>
          <span>Mosques</span>
        </div>
        <div className="sidebar-bottom">
          {link("/app/account", "Account")}
          <StatusBadge>{plan ?? "Guest"}</StatusBadge>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <Link href="/" className="wordmark">
            MIQĀT
          </Link>
          <span className="topbar-caption">Islamic time, organised.</span>
          <Link href="/app/account">Account</Link>
        </header>
        <main id="main-content" className="app-content">
          {children}
        </main>
      </div>
      {open && (
        <nav
          id="mobile-more"
          aria-label="More navigation"
          className="mobile-more"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setMenu(null);
              document.getElementById("more-button")?.focus();
            }
          }}
        >
          {navigation.slice(3).map(([href, label]) => link(href, label))}
          {link("/app/account", "Account")}
          <button onClick={() => setMenu(null)}>Close menu</button>
        </nav>
      )}
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {link("/app", "Today")}
        {link("/app/prayers", "Prayer")}
        {link("/app/sixth", "Sixth")}
        <button
          id="more-button"
          aria-expanded={open}
          aria-controls="mobile-more"
          onClick={() => setMenu(open ? null : pathname)}
        >
          More
        </button>
      </nav>
    </div>
  );
}
