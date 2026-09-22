import Link from "next/link";
export default function Terms() {
  return (
    <main className="page-shell">
      <header>
        <Link href="/">MIQĀT</Link>
        <h1>Terms of use</h1>
      </header>
      <article className="app-card">
        <p>
          Miqāt provides prayer-time planning, night calculations and optional calendar assistance.
          Keep your login secure and use only calendars you are authorised to access.
        </p>
        <h2>Prayer and calendar planning</h2>
        <p>
          Prayer times depend on the selected source, coordinates, calculation method and timezone.
          Check important timings with your local authority. Night segments are mathematical
          divisions of supplied Maghrib and following Fajr; scheduling suggestions are optional
          planning aids. Availability recommendations can change when your calendar changes.
        </p>
        <h2>Free and paid service</h2>
        <p>
          The Sixth of the Night calculator and core prayer calculations remain free. Pro adds the
          features described on the pricing page. Calendar management is currently unavailable; a
          subscription does not itself authorise calendar changes.
        </p>
        <p>
          Where subscriptions are offered, Stripe Checkout displays the recurring monthly price and
          payment terms before purchase. Manage payment details and cancel through Account → Manage
          billing. A scheduled end-of-period cancellation retains eligible access until the paid
          period expires. Payment failures can suspend Pro access while free features remain
          available.
        </p>
        <h2>Availability and changes</h2>
        <p>
          External calendar, prayer and payment services can be unavailable. Miqāt does not
          guarantee uninterrupted service or that a suggested schedule is suitable for every
          situation. Do not use the service to access another person’s account or interfere with its
          operation.
        </p>
        <h2>Privacy and ending use</h2>
        <p>
          Read the <Link href="/privacy">privacy policy</Link> for data handling and disconnection
          details. Disconnecting Google and cancelling billing are separate actions.
        </p>
        <p>
          <strong>Owner/legal review required before commercial launch:</strong> insert the service
          operator and support contact, applicable consumer cancellation/refund information,
          governing terms and an appropriate liability clause. These draft terms do not waive
          statutory consumer rights.
        </p>
      </article>
    </main>
  );
}
