# Qaylula and English/Arabic interface

## Public preview and account routine

Qaylula appears in the public `/app` and `/sixth` workspace and on the signed-in Today page. It is also a template in the existing routine editor. Preview is public; saving an account routine uses the existing authenticated, Pro-gated `/api/account/routines` endpoints.

The source of truth is `type: qaylula`, relative timing anchored to `dhuhr`, a signed offset in minutes, duration, and enabled state. Before uses a negative offset; after uses a positive offset. No resolved clock time is persisted. The editor accepts integer offsets 0–1440 and durations 1–1440 minutes and offers common presets. These are personal scheduling choices, not a prescribed religious time.

Public providers supply civil clocks. `WorkspaceQaylula` resolves these through the existing `resolveDailyPrayerInstants` helper with its strict timezone/DST policy. Account schedules already contain instants. Both use `resolveRoutineOccurrence`; calendar compatibility uses the existing routine occurrence adapter. No new scheduling engine, table, migration, or calendar rollout change is required.

Validated guest configuration is stored in `sessionStorage` under `miqat.qaylula.v1`. It survives refresh in the same tab. It is not an anonymous database record and does not survive closing the tab. A pending explicit Save is stored separately, then resumed through the existing safe sign-in return to `/sixth?routine=qaylula#qaylula`. A URL alone cannot cause a save. Save preserves an existing routine's name, recurrence and calendar/reminder settings. Multiple Qaylula routines require choosing one in Automations rather than overwriting an arbitrary record.

Manual Maghrib/Fajr input cannot supply Dhuhr. Following a public workspace refresh, a full prayer timetable may need recalculating for the preview; the Qaylula configuration remains. Signed-in users manage their saved routines in Automations; the preview card remains the browser draft editor and does not fetch private routines merely to render.

Managed calendar writes remain disabled by the existing rollout controls. Saving Qaylula does not enable calendar sync, reminders or automation. Existing auth and entitlement checks remain authoritative.

## Locale and RTL

`src/lib/i18n/config.ts` is the central locale registry and UI-copy translator. English source copy is the fallback, so missing Arabic entries render readable English. `locales/ar.ts` is the Arabic resource; `labels.ts` explicitly maps stable enums to display copy. Adding another language means adding a dictionary and a registry entry with its label, direction and Intl locale; the picker derives its options from this registry.

`SharedHeader` owns the single language picker. The `miqat_locale` cookie lasts one year, applies to `/`, uses SameSite=Lax and Secure on HTTPS, and does not require an account. The root server layout reads the allowlisted cookie to render matching HTML `lang` and `dir`; the client provider updates these on switching. RTL uses document direction and logical CSS properties, not transforms. The header retains the picker on the physical right on desktop and mobile.

Translation boundaries contain explicit interface copy. User routine names, calendar event/calendar names, emails, locations, provider names, timestamps, coordinates and billing values remain raw data. Parameters in translated messages are inserted once, never recursively translated. There is no DOM text walker or pattern-based translator. Dates/times may be explicitly formatted with Intl; switching locale never changes the prayer calculations or stable identifiers.

Major translated surfaces include landing/free entry, pricing, public calculator and night views, Qaylula, shared navigation, auth/forgot-password UI, account/settings, routines and calendar/automation UI. Unmapped copy safely remains English; legacy integration detail strings and legal documents are not a complete Arabic localisation. Arabic terminology consistently uses سدس الليل, قيام الليل, القيلولة, الفجر, الظهر, العصر, المغرب and العشاء.

## Validation and limitations

Targeted tests cover deterministic Qaylula resolution, provider-clock conversion, DST, guest drafts, auth continuation, Pro/ownership boundaries, Arabic switching and cookie restoration, server-rendered root direction, raw-data preservation and English fallback. Run the complete repository validation commands before release.

Automated DOM and server-render tests do not constitute visual browser testing. Check desktop/mobile RTL layout and real sign-in/Stripe handoff in the browser before deployment. No Stripe server/payment implementation is changed.

Password-reset email delivery still requires external production configuration: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, and `APP_ORIGIN`. Never commit their secret values.

## Pre-deployment copy review

Primary copy corrected manually before commit: “Calendar intelligence”, “Checking connection…”, “Google Calendar connected”, “Connected as:”, “Add {module} to Calendar”, “All Prayers”, “Qiyam / Tahajjud Plan”, “Waiting for Google…”, the unconfigured-connection notice, and common connection/popup/session errors. The existing translated Connect, Disconnect, Check connection and Cancel labels now also apply to the legacy connection panel. Custom module titles and emails remain raw.

English fallback intentionally remains for secondary legacy managed-write details (the rollout is disabled), including “Calendar sync results by night”, “Already synced”, “Already added”, “Updated”, “Added”, “Removed”, “Already absent”, “synced event”, “one-night event”, “This night”, technical retry/ownership/removal diagnostics and detailed horizon/removal instructions. Legal documents and external provider help/technical responses are not fully localised. Provider names, currency/billing values, cities, timestamps and user-generated content are data rather than missing UI translations.

Qaylula's Dhuhr, before/after, offset, duration, preview, Save and Pro-restriction copy is translated centrally. Religious labels retain الفجر، الظهر، العصر، المغرب، العشاء، قيام الليل، القيلولة and سدس الليل. Internal identifiers and scheduling behaviour are unchanged.
