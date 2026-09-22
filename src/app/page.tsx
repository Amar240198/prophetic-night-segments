import Link from "next/link";
export default function Home() {
  return (
    <main className="landing">
      <nav aria-label="Public navigation">
        <Link className="wordmark" href="/">
          MIQĀT
        </Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/sign-in">Sign in</Link>
      </nav>
      <header className="landing-hero">
        <p className="eyebrow">A rhythm for every day</p>
        <h1>Your calendar, automatically aligned with Salah.</h1>
        <p>
          See prayer times alongside the calendar you already use. Find conflicts, discover usable
          prayer windows and plan protected worship time.
        </p>
        <div className="landing-actions">
          <Link className="primary-button" href="/get-started">
            Get started
          </Link>
          <Link className="secondary-button" href="/pricing">
            See pricing
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
            <h2>{title}</h2>
            <p>{description}</p>
          </section>
        ))}
      </section>
      <section className="app-card">
        <h2>Sixth of the Night</h2>
        <p>
          Explore the midpoint, last third and final sixth of the Islamic night. Free, with no
          account required.
        </p>
        <Link className="secondary-button" href="/sixth">
          Open Sixth calculator
        </Link>
      </section>
      <footer>
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        <p>
          Calendar management is currently unavailable. Night divisions use supplied Maghrib and the
          following Fajr.
        </p>
      </footer>
    </main>
  );
}
