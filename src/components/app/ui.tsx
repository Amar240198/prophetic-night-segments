import { T } from "@/components/i18n/LocaleProvider";
import type { ReactNode } from "react";
export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <header className="page-header">
      <p className="eyebrow">
        <T>{"MIQĀT"}</T>
      </p>
      <h1>
        <T>{title}</T>
      </h1>
      {description && (
        <p>
          <T>{description}</T>
        </p>
      )}
    </header>
  );
}
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="app-card">
      <h2>
        <T>{title}</T>
      </h2>
      {children}
    </section>
  );
}
export function StatusBadge({ children }: { children: ReactNode }) {
  return <span className="status-badge">{children}</span>;
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
