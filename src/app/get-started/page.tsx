import Link from "next/link";

export default function GetStartedPage() {
  return (
    <main className="landing">
      <nav aria-label="Public navigation">
        <Link className="wordmark" href="/">
          MIQĀT
        </Link>
      </nav>
      <section className="app-card" aria-labelledby="get-started-title">
        <h1 id="get-started-title">How would you like to begin?</h1>
        <p>Explore the free Miqāt calculator now, or sign in to use account features.</p>
        <div className="landing-actions">
          <Link className="primary-button" href="/sixth">
            Continue for Free
          </Link>
          <Link className="secondary-button" href="/sign-in">
            Sign In / Create Account
          </Link>
        </div>
      </section>
    </main>
  );
}
