import type { ReactNode } from "react";
export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="page-header">
      <p className="eyebrow">MIQĀT</p>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="app-card">
      <h2>{title}</h2>
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
