import Link from "next/link";
import { PrayerWorkspace } from "@/components/app/PrayerWorkspace";
import { SixthPage } from "@/components/app/PrayerPages";
export default function FreeCalculator() {
  return (
    <div className="public-calculator">
      <nav aria-label="Calculator navigation">
        <Link className="wordmark" href="/">
          MIQĀT
        </Link>
        <Link href="/app">Open app</Link>
      </nav>
      <main className="app-content">
        <PrayerWorkspace>
          <SixthPage />
        </PrayerWorkspace>
      </main>
    </div>
  );
}
