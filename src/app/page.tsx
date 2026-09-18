import Link from "next/link";
const modules = [
  [
    "All Prayers",
    "Your daily timetable, with the five obligatory prayers ready for your calendar.",
    "/app/prayers",
  ],
  ["Sixth of the Night", "See the midpoint, last third and final sixth of your night.", "/sixth"],
  ["Fasting", "Plan Mondays, Thursdays, White Days and the Dāwūd pattern.", "/app/fasting"],
  ["Routines", "Give Qur’an, dhikr and personal routines a place in your day.", "/app/routines"],
  [
    "Calendar automation",
    "Connect Google Calendar, sync dated schedules and manage Miqāt-owned events.",
    "/app/calendar",
  ],
  ["Miqāt Pro", "See your current plan and account preferences in one place.", "/app/account"],
];
export default function Home() {
  return (
    <main className="landing">
      <nav aria-label="Public navigation">
        <Link href="/" className="wordmark">
          MIQĀT
        </Link>
        <Link href="/app/account">Sign in</Link>
      </nav>
      <header className="landing-hero">
        <p className="eyebrow">A rhythm for every day</p>
        <h1>Islamic time, organised around your life.</h1>
        <p>Prayer times, Qiyām, fasting, routines and calendar automation — in one place.</p>
        <div className="landing-actions">
          <Link className="primary-button" href="/app">
            Get started
          </Link>
          <Link className="secondary-button" href="/sixth">
            Open Sixth calculator
          </Link>
        </div>
        <span className="landing-note">Free calculator · No account required</span>
      </header>
      <section className="landing-modules" aria-label="Explore Miqāt">
        {modules.map(([title, description, href]) => (
          <Link className="app-card" href={href} key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="module-link">Explore →</span>
          </Link>
        ))}
      </section>
      <footer>
        MIQĀT · Prayer times supplied by your chosen source. Night divisions calculated from Maghrib
        to following Fajr.
      </footer>
    </main>
  );
}
