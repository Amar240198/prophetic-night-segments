import { T } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
import { formatPlanPrice, PRO_BENEFITS } from "@/lib/billing/plans";
import { BillingButton } from "@/components/product/BillingButton";
export default function Page() {
  return (
    <main className="landing">
      <header className="landing-hero">
        <h1>
          <T>{"Your calendar, automatically aligned with Salah."}</T>
        </h1>
        <p>
          <T>
            {"Start free. Choose Pro when you want your real schedule and prayer times together."}
          </T>
        </p>
      </header>
      <div className="dashboard-grid">
        <section className="app-card">
          <h2>
            <T>{"Free"}</T>
          </h2>
          <p>
            <T>
              {"Prayer times, Sixth of the Night, night information and manual calendar export."}
            </T>
          </p>
          <Link className="secondary-button" href="/app">
            <T>{"Get started free"}</T>
          </Link>
        </section>
        <section className="app-card">
          <h2>
            <T>{"Miqāt Pro"}</T>
          </h2>
          <p className="summary-value">{formatPlanPrice()}</p>
          <p>
            <T>{"Monthly subscription. Cancel through your billing portal."}</T>
          </p>
          <ul>
            {PRO_BENEFITS.map((x) => (
              <li key={x}>
                <T>{x}</T>
              </li>
            ))}
          </ul>
          <p>
            <T>
              {
                "Calendar analysis and recommendations use read access. Automatic calendar changes are currently unavailable."
              }
            </T>
          </p>
          <BillingButton autoStart>
            <T>{"Upgrade to Miqāt Pro"}</T>
          </BillingButton>
        </section>
      </div>
      <footer>
        <Link href="/privacy">
          <T>{"Privacy"}</T>
        </Link>{" "}
        ·{" "}
        <Link href="/terms">
          <T>{"Terms"}</T>
        </Link>{" "}
        ·{" "}
        <Link href="/sixth">
          <T>{"Free Sixth calculator"}</T>
        </Link>
      </footer>
    </main>
  );
}
