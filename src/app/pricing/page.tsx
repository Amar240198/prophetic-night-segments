import Link from "next/link";
import { formatPlanPrice, PRO_BENEFITS } from "@/lib/billing/plans";
import { BillingButton } from "@/components/product/BillingButton";
export default function Page() {
  return (
    <main className="landing">
      <nav aria-label="Public navigation">
        <Link className="wordmark" href="/">
          MIQĀT
        </Link>
        <Link href="/sign-in">Sign in</Link>
      </nav>
      <header className="landing-hero">
        <h1>Your calendar, automatically aligned with Salah.</h1>
        <p>Start free. Choose Pro when you want your real schedule and prayer times together.</p>
      </header>
      <div className="dashboard-grid">
        <section className="app-card">
          <h2>Free</h2>
          <p>Prayer times, Sixth of the Night, night information and manual calendar export.</p>
          <Link className="secondary-button" href="/sign-up">
            Get started free
          </Link>
        </section>
        <section className="app-card">
          <h2>Miqāt Pro</h2>
          <p className="summary-value">{formatPlanPrice()}</p>
          <p>Monthly subscription. Cancel through your billing portal.</p>
          <ul>
            {PRO_BENEFITS.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p>
            Calendar analysis and recommendations use read access. Automatic calendar changes are
            currently unavailable.
          </p>
          <BillingButton>Upgrade to Miqāt Pro</BillingButton>
        </section>
      </div>
      <footer>
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{" "}
        <Link href="/sixth">Free Sixth calculator</Link>
      </footer>
    </main>
  );
}
