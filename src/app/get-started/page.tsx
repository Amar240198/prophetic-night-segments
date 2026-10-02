import { T } from "@/components/i18n/LocaleProvider";
import Link from "next/link";

export default function GetStartedPage() {
  return (
    <main className="landing">
      <section className="app-card" aria-labelledby="get-started-title">
        <h1 id="get-started-title">
          <T>{"How would you like to begin?"}</T>
        </h1>
        <p>
          <T>{"Explore the free Miqāt calculator now, or sign in to use account features."}</T>
        </p>
        <div className="landing-actions">
          <Link className="primary-button" href="/app">
            <T>{"Continue for Free"}</T>
          </Link>
          <Link className="secondary-button" href="/sign-in">
            <T>{"Sign In / Create Account"}</T>
          </Link>
        </div>
      </section>
    </main>
  );
}
