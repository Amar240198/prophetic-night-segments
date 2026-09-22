# Miqāt test-mode release setup

This release retains five authenticated destinations: Today, Calendar, Automations, Settings and Account. `/sixth` is free and independent. Old authenticated module routes redirect; they are not separate editors. Calendar writes remain disabled. Never use live cards or live Stripe keys for this acceptance run.

## Stripe TEST configuration

1. In Stripe Dashboard select **Test mode** or an isolated **Sandbox** from the account picker. Keep the product, price, API key, webhook and portal configuration in that same environment.
2. Open **Product catalogue → Add product**. Name it **Miqāt Pro**. Create a **recurring**, **monthly**, **GBP £4.99** flat-rate price. Do not add a trial. Checkout does not request a trial.
3. Open the product's price details and copy its **Price ID**, beginning `price_`. Do not use the `prod_` identifier. The server validates currency, interval, amount, active status and mode.
4. Open **Developers / Workbench → API keys** (the [test API keys page](https://dashboard.stripe.com/test/apikeys)). Reveal the test secret key beginning `sk_test_`. Hosted Checkout does not require a publishable key in the browser.
5. In **Vercel → sixth-of-the-night → Settings → Environment Variables → Production**, add server-only `STRIPE_SECRET_KEY`, `STRIPE_PRO_MONTHLY_PRICE_ID`, and `STRIPE_MODE=test`. Set `STRIPE_LIVE_ENABLED=false`, `APP_ORIGIN=https://sixth-of-the-night.vercel.app`, and retain `CALENDAR_WRITES_ENABLED=false`. Put credentials directly in Vercel, never in chat or Git.
6. In Stripe **Workbench → Webhooks → Create an event destination**, choose **Your account**, snapshot events, and API version **2026-08-26.dahlia**, matching the installed Stripe SDK. Choose **Webhook endpoint** and enter `https://sixth-of-the-night.vercel.app/api/webhooks/stripe`.
7. Select exactly these supported events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
8. Open the saved endpoint, reveal its **Signing secret**, and copy the `whsec_` value into Vercel as `STRIPE_WEBHOOK_SECRET`. This is the endpoint secret, not a CLI listener secret or API key.
9. Open **Settings → Billing → Customer portal** in the same test environment ([test portal settings](https://dashboard.stripe.com/test/settings/billing/portal)). Save a default configuration enabling payment-method updates, invoice history and subscription cancellation **at the end of the billing period**. Leave plan switching and quantity updates disabled for this single-plan launch. Set the return URL to `https://sixth-of-the-night.vercel.app/app/account` and terms/privacy links to `/terms` and `/privacy` on that origin.
10. Redeploy after saving the environment variables. Sign in with a dedicated test account and use **Account → Upgrade**. Pay in hosted test Checkout with `4242 4242 4242 4242`, a future expiry and any three-digit CVC. Verify the £4.99 monthly amount and test-mode indicator. Verify webhook deliveries return 2xx and Account shows Pro after server confirmation. Opening the success URL alone must not upgrade a Free account. Repeat Upgrade to verify no duplicate active subscription is created.
11. Use **Manage billing** to cancel at period end. Account must retain Pro and show its expiry while the subscription remains active. For immediate revocation acceptance, cancel that test subscription immediately in Stripe Dashboard and verify the signed deletion event makes the account Free. For actual period expiry, use a separate Stripe test-clock fixture or wait for the period; do not change database expiry to claim Stripe end-to-end acceptance.
12. Replay a delivered event from Workbench: it must return success without changing the result a second time. Test payment failure and confirm `past_due`/`unpaid` deny premium APIs. An unconfigured real Checkout run is **BLOCKED BY EXTERNAL CONFIGURATION**, even when fixtures pass.

Official references: [products and prices](https://docs.stripe.com/products-prices/manage-prices), [API keys](https://docs.stripe.com/keys), [webhook setup](https://docs.stripe.com/webhooks), [portal configuration](https://docs.stripe.com/customer-management/configure-portal), [test payments](https://docs.stripe.com/testing).

## Password-reset email

Use the operator's chosen SMTP provider; the implementation does not require a specific vendor. Verify a sender/domain with that provider and configure its required SPF/DKIM records. In Vercel Production set `SMTP_HOST`, `SMTP_PORT` (`465` for TLS or `587` for STARTTLS), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` (verified sender), and `APP_ORIGIN=https://sixth-of-the-night.vercel.app`. Redeploy, request a reset for a test account, verify actual inbox delivery and one-hour link expiry, then verify single use and revocation of existing sessions. Missing delivery configuration returns 503 and does not create a reset token or claim an email was sent. Fixture transport tests are not inbox acceptance.

## Migration and release gate

Run targeted suites, then `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:all`, and `git diff --check`. Fresh PGlite/PostgreSQL-compatible database tests apply 001–011 numerically; upgrade tests seed pre-009 settings, Google connections and selections and verify preservation. They do not simulate Neon infrastructure or concurrent production traffic.

Migration 009 only changes the new-account default and pauses legacy automation; it preserves original `prayer_source` and automation source identity. No legacy prayer times are converted or external calendar events deleted. Migration 010 copies established supported automation sources into canonical prayer settings, leaves removed sources unconfirmed, and never modifies entitlements. Migration 011 adds unique Stripe customer/subscription identifiers, period/state fields and idempotent events with tenant foreign keys, without card data.

`node scripts/saas-release-migration.mjs /path/to/private-env` inspects schema markers without changing data. Only after the complete gate passes, invoke with `RELEASE_VALIDATION_PASSED=true` and `--apply`. The runner skips existing migrations, applies pending 009–011 transactionally in order, and compares connection, selection, event-mapping and routine rows without printing private values. Never point fresh-database tests at production.

## Remaining operational acceptance

- Confirm real Google read consent with an eligible signed-in account. Migration preserves encrypted credentials and calendar selections. Historical write-only grants can require read reconnection; they cannot be silently expanded.
- Calendar block previews use the destination chosen in Settings. The historical bulk routine/reminder reconciler still targets the primary calendar. Bulk writes are unavailable in this release; support for alternative bulk destinations requires separate implementation and write acceptance before activation.
- Database-backed per-email authentication/reset throttles are present. Configure Vercel edge/IP abuse protection before public commercial launch; per-email limits alone do not prevent distributed signups. Arrange retention/cleanup for expired sessions, tokens, rate-limit rows and billing/audit records.
- The operator must supply public identity, support contact and final retention/refund terms before live commercial activation. Privacy/terms content in this preview does not constitute legal acceptance.
- No new trial is offered. Existing unexpired legacy trials are preserved. `active` and `trialing` require an unexpired billing period; `past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired` and `paused` deny Pro. An active period-end cancellation retains access only until expiry.
