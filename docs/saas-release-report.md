# Miqāt release verification — 22 September 2026

Production: https://sixth-of-the-night.vercel.app

Deployment: `dpl_4bbfdTDsjyyevqQBybeK1dW3ZfTP`, status READY, production target. The CLI deployed the existing working tree without resetting, checking out, stashing or discarding earlier work. Source changes remain uncommitted on `main`.

## Validation

| Check                     | Result                                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Full suite                | 408 tests, 41 files, all passed                                                                                                                 |
| Requested targeted suites | All passed in the full run, including 138 Google Calendar integration tests, 38 billing/security tests and 13 consolidated application UI tests |
| Formatting                | `pnpm format:check` passed                                                                                                                      |
| Lint                      | `pnpm lint` passed, zero warnings                                                                                                               |
| Types                     | `pnpm typecheck` passed                                                                                                                         |
| Production build          | `pnpm build:all` passed; Vercel build also passed                                                                                               |
| Diff whitespace           | `git diff --check` passed                                                                                                                       |
| Migrations                | Fresh chain and pre-009 upgrade tests passed; production 009, 010 and 011 committed in order                                                    |
| Data preservation         | Connection, selected-calendar, event-mapping and routine snapshots unchanged across production migration                                        |
| Source removal            | Original legacy source retained for review, automation paused, new calculations reject removed source                                           |
| Credential scan           | No real secret patterns found in tracked/untracked release source files                                                                         |

The initial build was blocked by the local sandbox's worker-port restriction; rerunning the same build outside that restriction passed. The first UI run exposed an outdated reset-button selector; it was corrected to the actual user-facing label while retaining the assertion that unavailable delivery must not claim success.

## Production smoke

Passed real HTTP checks for landing, pricing, public Sixth, privacy, terms, sign in and sign up. A disposable account verified Free signup/session creation, sign out/sign in, onboarding resume, confirmed exact coordinates, all five authenticated page responses, direct premium API denial, real AlAdhan prayer times and Sixth data, public coordinate calculation, removed-source rejection and honest unconfigured billing/email responses. The account and its rate-limit records were removed afterward.

An unauthenticated mutation request returned HTTP 503 with `CALENDAR_WRITES_DISABLED`. The production environment was explicitly retained at `CALENDAR_WRITES_ENABLED=false` before deployment. No Google mutation, real email delivery or Stripe payment was attempted.

One existing Google connection and one selected-calendar row were preserved. There are zero connected accounts with current Pro eligibility. Real Google event reading/conflict/recommendation acceptance therefore remains blocked until an existing connected account completes Stripe TEST activation and supplies a usable read session; it was not bypassed with a manual entitlement promotion. Browser visual smoke was unavailable because no browser surface was connected. UI rendering and interactions are covered by automated tests, not claimed as production browser acceptance.

## Product ownership

Today and Calendar display prayer/calendar data and actions. Automations owns worship and protection preferences. Settings owns prayer configuration and calendar connection/selection. Account owns identity, security and billing. Onboarding reuses these editors and persists progress. Legacy routes redirect and public Sixth exposes one-night export with a Miqāt CTA instead of bulk Google automation controls. Existing unused compatibility components remain unmounted.

The final review fixed migration 009's original silent preference rewrite, blocked day calculations before explicit prayer-setting confirmation, added legacy-source review messaging, cleared stale calendar data on refresh/disconnection, corrected hook dependencies and added direct premium-route denial coverage. The mathematical engine and its precision policy were not changed.

## External acceptance

Stripe TEST variables are absent: mocked/fixture acceptance passed; real Checkout, Portal and webhook delivery are **BLOCKED BY EXTERNAL CONFIGURATION**. No Stripe LIVE activation occurred. SMTP is unconfigured; transport/token tests passed, actual inbox delivery remains blocked. Operator identity, support contact and final privacy/terms review remain required before commercial activation. Bulk routine reconciliation remains primary-calendar-only and globally unavailable; the selected destination applies to protected prayer blocks.

Follow [the exact Stripe TEST and SMTP setup guide](saas-release-setup.md). Do not paste credentials into chat or enable production calendar writes.
