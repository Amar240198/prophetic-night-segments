import { T } from "@/components/i18n/LocaleProvider";
import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <header className="landing-hero">
        <p className="eyebrow">
          <T>{"A rhythm for every day"}</T>
        </p>
        <h1>
          <T>{"Your calendar, automatically aligned with Salah."}</T>
        </h1>
        <p>
          <T>
            {
              "See prayer times alongside the calendar you already use. Find conflicts, discover usable prayer windows and plan protected worship time."
            }
          </T>
        </p>
        <div className="landing-actions">
          <Link className="primary-button" href="/get-started">
            <T>{"Get started"}</T>
          </Link>
          <Link className="secondary-button" href="/pricing">
            <T>{"See pricing"}</T>
          </Link>
        </div>
      </header>
      <section className="landing-modules" aria-label="How Miqāt helps">
        {[
          ["See your day", "Prayer times and your real schedule in one chronological view."],
          [
            "Find prayer windows",
            "Understand conflicts and the reasons behind each recommendation.",
          ],
          ["Choose what to automate", "One place for prayer, Qiyām, fasting and worship routines."],
        ].map(([title, description]) => (
          <section className="app-card" key={title}>
            <h2>
              <T>{title}</T>
            </h2>
            <p>
              <T>{description}</T>
            </p>
          </section>
        ))}
      </section>
      <section className="app-card">
        <h2>
          <T>{"Sixth of the Night"}</T>
        </h2>
        <p>
          <T>
            {
              "Explore the midpoint, last third and final sixth of the Islamic night. Free, with no account required."
            }
          </T>
        </p>
        <Link className="secondary-button" href="/sixth">
          <T>{"Open Sixth calculator"}</T>
        </Link>
      </section>
      <footer>
        <Link href="/privacy">
          <T>{"Privacy"}</T>
        </Link>{" "}
        ·{" "}
        <Link href="/terms">
          <T>{"Terms"}</T>
        </Link>
        <p>
          <T>
            {
              "Calendar management is currently unavailable. Night divisions use supplied Maghrib and the following Fajr."
            }
          </T>
        </p>
      </footer>
    </main>
  );
}
