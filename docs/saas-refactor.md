# Miqāt consolidation implementation map

Audit: 21 September 2026. Existing repository and Vercel project `sixth-of-the-night` are retained. Next.js 16.2.11, React 19.2.4, Tailwind 4, Neon PostgreSQL, custom scrypt password authentication and hashed database sessions. Monorepo engine/provider/SDK/Fastify packages remain intact. Production schema inspection confirms migrations 007 and 008; 009 is local and pending. Existing production database credentials are present, Stripe and email-delivery configuration are absent. The calendar write fence fails closed.

## Route and control migration

| Current control/location                          | Canonical location                            | Action                                                          |
| ------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| All Prayers `/app/prayers`                        | Today                                         | Redirect; remove export/sync selections                         |
| Sixth `/app/sixth`                                | Today summary and `/sixth`                    | Redirect detailed tool; retain engine                           |
| Fasting page, browser fasting settings            | Automations; account automation configuration | Move; offer explicit browser preference import                  |
| Routines page                                     | Automations                                   | Move existing editor and persistence                            |
| Calendar module selection / GoogleCalendarSection | Automations                                   | Remove duplicate mounted controls; retain compatibility APIs    |
| Calendar source settings, Account source settings | Settings → Prayer settings                    | One editor backed by account preferences                        |
| Calendar intelligence calendar checkboxes         | Settings → Calendar                           | Move; reuse calendar_preferences rows                           |
| Protected block destination                       | Settings → Calendar                           | One persisted writable destination                              |
| Analysis duration/buffers/protection mode         | Automations                                   | Move; reuse prayer_analysis                                     |
| Automation provider/location                      | Settings → Prayer settings                    | One source; legacy configuration read adapter                   |
| Horizon 30/60/90/Continuous controls              | Internal automation policy                    | Hide; new plans maintain 30 rolling days                        |
| Trial button                                      | Account/pricing                               | Remove new trial activation; preserve unexpired existing trials |
| Public Sixth Google management                    | Miqāt account                                 | Remove from free tool; preserve manual ICS                      |
| Billing                                           | Account / hosted Stripe Portal                | Add to existing entitlement table                               |

## Canonical storage and runtime

- `miqaat_preferences`: prayer configuration, onboarding progress, analysis and notification preferences. Existing location/source fields retained for compatibility, not separately edited.
- `miqaat_automation.configuration`: automation modules, fasting, reminders, Qiyām and routine anchors. Read adapters use canonical prayer settings. Existing engine/reconciliation and ownership services are reused.
- `calendar_preferences`: selected read calendars and one destination per connection. Ownership verified against authenticated Google account.
- `miqaat_routines`: existing account routine records, managed only in Automations.
- `miqaat_entitlements`: extended with Stripe lifecycle/period/mode data. Server feature authorization is authoritative. Verified Stripe state only; success URLs never grant access.
- Additive migrations preserve legacy data. Existing users with meaningful saved settings/connections retain setup progress; new users enter one persistent onboarding flow.

## Execution and acceptance

Implement shell/preferences first, then Today/Calendar/Automations/Settings/Account, public cleanup, onboarding, billing and central enforcement. Hosted Checkout and Portal, raw signed webhooks, transactional event idempotency, customer reuse, concurrency-safe checkout, explicit reconciliation. No automatic trial creation, no live Stripe activation, no calendar writes. Missing Stripe/email credentials are external gates, not reasons to leave other code unfinished.

Run behaviour, migration, tenant isolation, billing lifecycle, OAuth/calendar regression tests; formatting, lint, typecheck (after build type generation), full production build. Deploy only after additive migrations validate; inspect production safety flag and smoke public/free/denied-premium routes. Real test Checkout and Google consent require configured external accounts and are reported honestly.

## Official references reviewed

- [Vercel Academy subscription store](https://vercel.com/academy/subscription-store) and [deployment](https://vercel.com/academy/subscription-store/deploy-to-production): adopt lifecycle patterns, retain Neon/auth.
- [Vercel production checklist](https://vercel.com/docs/production-checklist).
- [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks), [signature/retry guidance](https://docs.stripe.com/webhooks), [Portal](https://docs.stripe.com/customer-management/integrate-customer-portal), [testing](https://docs.stripe.com/testing).
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).
- OWASP [authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [tenant isolation](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html).
