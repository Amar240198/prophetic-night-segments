import Link from "next/link";
export default function Privacy() {
  return (
    <main className="page-shell">
      <header>
        <Link href="/">MIQĀT</Link>
        <h1>Privacy</h1>
      </header>
      <article className="app-card">
        <p>
          Miqāt uses your account, prayer preferences and optional calendar connection to show Salah
          alongside your schedule.
        </p>
        <h2>Account and location</h2>
        <p>
          We store your email, a password hash, session records and saved preferences in PostgreSQL.
          Precise location is requested only when you choose it. Saved coordinates and timezone are
          sent to AlAdhan to calculate prayer times. The public calculator can also use times you
          enter manually.
        </p>
        <h2>Google Calendar</h2>
        <p>
          Connecting Google first requests read access. You choose which calendars Miqāt analyses in
          Settings. Calendar event titles, times and availability are read to detect conflicts and
          recommend prayer windows. Ordinary calendar event content is processed for the request
          rather than stored as a separate copy of your calendar. Connection details, selected
          calendar identifiers, encrypted credentials and Miqāt-owned event mappings are persisted.
        </p>
        <p>
          Calendar management requires separate consent and is currently unavailable in production.
          Where management is enabled, Miqāt stores owned-block metadata and mutation audit records.
          It must not automatically change unrelated meetings.
        </p>
        <p>
          Disconnect in Settings to revoke the connection and remove usable credentials. Existing
          calendar events and ownership/audit history are not automatically deleted when you
          disconnect. You can also revoke access in your Google Account’s third-party connections
          settings.
        </p>
        <h2>Payments</h2>
        <p>
          Stripe hosts Checkout and billing management. Miqāt stores Stripe customer/subscription
          identifiers, subscription status, billing periods and processed webhook identifiers.
          Payment-card details are handled by Stripe, not stored by Miqāt. Manage or cancel a
          subscription through Account → Manage billing. Cancellation does not automatically delete
          your account.
        </p>
        <h2>Retention and requests</h2>
        <p>
          Saved settings and operational records remain while your account is retained. Expired
          sessions and reset tokens stop working at expiry. Self-service account deletion is not
          currently available. The service operator must provide a support contact and confirm the
          applicable retention and deletion process before commercial launch.
        </p>
        <h2>Service providers</h2>
        <p>
          The service uses Vercel hosting, Neon PostgreSQL, AlAdhan for prayer times, Google for
          optional calendars and Stripe for optional subscriptions. If email delivery is configured,
          password reset emails pass through the configured mail provider. Basic Vercel Analytics is
          included for service usage measurement.
        </p>
        <p>
          <strong>Owner review required:</strong> publish the operator’s identity, contact details
          and final retention policy before accepting live subscriptions.
        </p>
      </article>
      <Link href="/terms">Terms</Link>
    </main>
  );
}
