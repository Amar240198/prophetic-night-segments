# Connect Google Calendar: setup guide

The integration is implemented, but Google sign-in requires your own Google Cloud
OAuth credentials. Without them the app shows a setup message and keeps `.ics`
downloads available. No Google account is required to calculate a night or download a file.

## 1. Create a Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in.
2. Click the project selector at the top. Select an existing project, or choose
   **New project**, name it **Prophetic Night Segments**, and click **Create**.
3. Make sure that project is selected before continuing.
4. Open **APIs & Services → Library**, search for **Google Calendar API**, open it,
   and click **Enable**.

## 2. Configure the Google consent screen

1. Open **Google Auth Platform**. If prompted, click **Get started**.
2. In **Branding**, enter the app name **Prophetic Night Segments**, your support
   email, and developer contact email. Save the form.
3. In **Audience**, choose **External** for ordinary personal Google accounts.
   Internal is only appropriate for an eligible Google Workspace organization.
4. Keep the app in **Testing** initially. Under **Test users**, add every Google
   email address you will use to test, including your own.
5. In **Data Access**, add exactly these two scopes:

   | Scope                                                   | Purpose                                                                                      |
   | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
   | `https://www.googleapis.com/auth/calendar.events.owned` | Create events in the user's primary calendar; Google grants event access on owned calendars. |
   | `https://www.googleapis.com/auth/userinfo.email`        | Display the connected email address.                                                         |

   The app does not request full Calendar, shared-calendar, contacts, Gmail,
   calendar-list, or profile access. Google does not offer an insert-only scope for
   an existing primary calendar. `calendar.events.owned` is the narrowest supported
   scope for this destination; `calendar.app.created` would require using a new
   app-created secondary calendar instead. Although Google grants read/change/delete
   permissions in the chosen scope, this implementation inserts events and reads
   only a matching event identifier to verify retries. It never edits unrelated events.

6. For public use beyond your test users, complete Google's publishing/verification
   requirements. Supply a real homepage, support details, privacy policy, and any
   required domain verification. Do not enter placeholder policy links. Testing
   mode is suitable for the prototype; it is not approval for unrestricted public use.

Google's references: [consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent)
and [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth).

## 3. Create OAuth Web Application credentials

1. In **Google Auth Platform → Clients**, click **Create client**.
2. Choose **Web application** and name it **Prophetic Night Segments Web**.
3. Under **Authorized redirect URIs**, add both exact URLs:

   ```text
   http://localhost:3000/api/google-calendar/callback
   https://prophetic-night-segments.vercel.app/api/google-calendar/callback
   ```

4. Click **Create**. Copy the **Client ID** and **Client secret** into your own
   local environment file and Vercel settings as described below. Never paste the
   secret into source code, a commit, a screenshot, a support message, or browser code.

Authorized JavaScript origins are not required: this app uses a server-side
authorization-code flow, not the Google JavaScript sign-in SDK. Redirect URIs must
match exactly, including protocol, port, path, and any trailing slash. If your
production domain changes, add its callback URI in Google and update Vercel.
For a different local port, register that exact callback and update the local variable.

## 4. Configure your local app

In the project folder, create or edit `.env.local`. Preserve any existing settings.
Copy these five variable names from `.env.example` and fill them in:

```dotenv
GOOGLE_CLIENT_ID=your-web-application-client-id
GOOGLE_CLIENT_SECRET=your-web-application-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
GOOGLE_SESSION_SECRET=your-generated-base64-secret
DATABASE_URL=your-neon-postgresql-connection-string
```

Generate the session encryption secret in your terminal:

```sh
openssl rand -base64 32
```

Paste the resulting single line as `GOOGLE_SESSION_SECRET`. It must encode exactly
32 random bytes (44 base64 characters, including the final `=`). Use a different
secret in production. These variables must **not** have a `NEXT_PUBLIC_` prefix.
`.env.local` is ignored by Git. Keep `.env.example` free of real credentials.

Restart the development server after changing variables:

```sh
pnpm dev
```

Open **http://localhost:3000**, using the same hostname and port as the configured
callback. Calculate a night, scroll to the Calendar card, and click **Connect Google
Calendar**. Allow the popup, sign in as a test user, approve calendar permission, and
return to the original app window. The calculation stays in that window. You should
see **Connected as: your email**. If your browser isolates the popup, the app polls
for the connection; the popup also shows a message and can be closed manually.

Click **Add Qiyam Plan to Calendar**, check the events you want, review their dates
and offsets, then click **Add selected events**. All Google-specific checkboxes start
unchecked. The custom wake event uses the existing wake-up buffer above. Fajr
preparation uses the existing end-of-night preparation offset. First Adhan appears
only when enabled in the calculator. Events go into your **primary Google Calendar**.

## 5. Configure Vercel production

1. Open [Vercel Dashboard](https://vercel.com/dashboard), then your
   **prophetic-night-segments** project.
2. Open **Settings → Environment Variables**.
3. Add the following variables and select the **Production** environment:

   | Name                        | Production value                                                           |
   | --------------------------- | -------------------------------------------------------------------------- |
   | `GOOGLE_CLIENT_ID`          | The Web Application Client ID from Google.                                 |
   | `GOOGLE_CLIENT_SECRET`      | The matching Google Client secret.                                         |
   | `GOOGLE_OAUTH_REDIRECT_URI` | `https://prophetic-night-segments.vercel.app/api/google-calendar/callback` |
   | `GOOGLE_SESSION_SECRET`     | A newly generated `openssl rand -base64 32` value, different from local.   |

4. Add `DATABASE_URL` using the Neon integration. Apply the migration as described below before deploying this persistence version.

5. Treat the client secret and session secret as sensitive values. Do not publish
   them or add them to client-side variables.
6. Open **Deployments**, select the latest production deployment, and choose
   **Redeploy**. Environment changes take effect on a new deployment.
7. Visit **https://prophetic-night-segments.vercel.app** and repeat the connection
   and selected-event steps using a Google test user.

Use the canonical production domain for OAuth. Random Vercel preview URLs will not
work with the production callback: their cookies belong to a different host. If you
need preview OAuth, use a stable preview domain, register its own callback, and set
matching Preview environment variables. Do not copy production credentials to
untrusted preview builds. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

## 6. Test checklist

- Check that **Connected as** shows the Google account you selected.
- Select just Fajr. Verify only Fajr is added, on the following date.
- Add the same selection again. It should report **Already added**, not a duplicate.
- Select the last third, Part 4, Part 5, Dāwūd prayer window, Part 6, preparation,
  and custom wake events as desired. Part 5 and the last third share a start boundary
  but are separate choices; selecting both intentionally creates both markers.
- Enable First Adhan in the calculator and verify it appears with the existing offset.
- Try a custom wake buffer that crosses midnight. Try manual dates spanning London's
  March or October DST transition and a half-hour zone such as `Asia/Kolkata`.
- In Google Calendar, compare the instants using the same display timezone as the
  calculator. Each event carries an absolute timestamp and the calculator's IANA zone;
  Google may display the same instant differently if your Calendar timezone differs.
- Decline calendar consent and check the clear permission error.
- Disconnect. The connected state should clear; existing calendar events stay intact.
- Verify `.ics` downloads still work while disconnected.

Automated checks:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Tests mock Google responses and cover OAuth state/PKCE, denial, connected and
unauthenticated states, expiry, cookie integrity, CSRF protection, input limits,
timezone/date preservation, event selection, duplicates, partial API failures, and
disconnect. They do not replace a live sign-in/import test with your own credentials.

## Errors and troubleshooting

| Message or symptom                  | What to do                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Connection is not configured        | Set all five environment variables and restart/redeploy.                                                                               |
| `redirect_uri_mismatch` from Google | Match the callback URI exactly in Google and the environment.                                                                          |
| Access blocked in Testing           | Add the signing-in email under Google Auth Platform → Audience → Test users.                                                           |
| Calendar permission was not granted | Reconnect and approve the Calendar permission. Confirm the Calendar API is enabled. Workspace admins may restrict access.              |
| Google Calendar connection failed   | Retry sign-in. Check client ID/secret, callback URI, and session secret. Restart the flow if the popup has been open over ten minutes. |
| Session has expired                 | Reconnect if the browser session expired or Google revoked access.                                                                     |
| Unable to create calendar event     | Retry. Already-created events are detected; partial results are shown separately.                                                      |
| Google Calendar is busy             | Wait, then retry. Google quota/rate-limit errors are not silently retried.                                                             |
| Previously deleted event            | Restore it from Google Calendar's trash, or change its planned time. The app will not silently restore a deleted event.                |
| Popup remains open                  | Return to the original window, use **Check connection**, then close the popup.                                                         |

## Security and prototype limitations

- Authorization-code flow with random state, PKCE S256, a ten-minute encrypted
  flow cookie, and server-side code exchange. The client secret and raw access token
  never appear in browser JavaScript or API responses. Cookie contents are encrypted
  and authenticated with AES-256-GCM and separate purpose labels.
- Sessions live in `HttpOnly`, `SameSite=Lax` cookies scoped to `/api/google-calendar`;
  cookies are `Secure` on HTTPS. Local HTTP is allowed only for localhost/127.0.0.1.
  Use HTTPS for deployed OAuth. Session responses use `Cache-Control: no-store`.
- The browser session cookie contains only a random 256-bit opaque identifier. Postgres
  stores its SHA-256 hash, never the cookie value. Browser sessions expire after 14 days.
  The separate ten-minute OAuth cookie contains encrypted state/PKCE data only.
- Access and optional refresh tokens are encrypted with AES-256-GCM before database
  insertion. HKDF derives a separate database encryption key from `GOOGLE_SESSION_SECRET`;
  authenticated data binds each token to its Google subject and access/refresh purpose.
  Keep this secret stable and backed up securely: rotating it makes stored tokens
  unreadable and requires reconnection. Ciphertexts carry a `v1` format prefix.
- OAuth requests offline access with consent. Expired access tokens are refreshed on
  demand while the browser session is valid. No background jobs run. If Google does
  not provide a refresh token, the connection works only until access-token expiry;
  a previously stored refresh token for the same Google subject is preserved.
- Disconnect deletes the connection and every associated browser session before
  attempting Google revocation. Existing calendar events remain. If revocation fails,
  users can remove the app through Google Account settings. Database failure returns
  a safe error instead of claiming successful disconnection.
- Database records use absolute `timestamptz` expiries; prayer-time precision and DST
  handling are unchanged. No preferences, event mappings, or automatic sync exist yet.
- Mutations require the configured same-origin `Origin` header. Requests are capped
  at 64 KiB and nine unique allowed event types, with validated explicit timestamps,
  IANA timezone and a maximum 24-hour event span. Requests cannot supply attendees,
  arbitrary calendars, redirects, or Google API URLs. Events are private and send no
  invitations. Descriptions are HTML-escaped before reaching Google.
- Google requires a positive duration: boundary reminders occupy **one minute**,
  while their starts remain exact. Prayer windows retain their exact calculated
  endpoints. Existing ICS precision and duration policies are unchanged.
- Deterministic event IDs make ordinary retries idempotent. Changed times create a
  new event; the previous plan is not automatically edited/deleted. Events are inserted
  individually, so partial success is possible. The UI shows each outcome; retrying
  skips confirmed existing events. Google does not guarantee collision detection
  across its globally distributed service, so this is not a transactional guarantee.
- Set notification preferences in Google Calendar. The integration uses your calendar's
  default reminders and cannot guarantee a device alarm.
- Before broad public release, add shared per-session/IP rate limiting (for example
  at the Vercel firewall or a durable store), monitor quota usage without logging
  tokens or callback authorization codes, and complete Google's verification and
  privacy requirements. The per-request limits and Google's quota handling are not
  a substitute for distributed abuse prevention.

Implementation references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[PKCE/OAuth reference](https://developers.google.com/identity/openid-connect/reference),
and [Calendar event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Persistence migration and rollout

This version requires `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_OAUTH_REDIRECT_URI`, and `GOOGLE_SESSION_SECRET`. There is no additional
secret, ORM, or database administration API key. Use a separate development database;
never test with production OAuth records.

With the intended Neon `DATABASE_URL` securely loaded into your shell environment,
run this **once**, from the repository root, using the PostgreSQL `psql` client:

```sh
PGDATABASE="$DATABASE_URL" psql -X --set=ON_ERROR_STOP=1 --file=migrations/001_google_calendar_persistence.sql
```

`PGDATABASE` accepts a PostgreSQL connection URI. This keeps credentials out of command
arguments. Do not echo the URL or paste it into source code. Preserve Neon's TLS
connection settings. The migration is transactional and deliberately fails if its
existing tables are encountered; it is not run automatically during build or startup.
It creates only `google_connections` and `browser_sessions` and their constraints/indexes.
`google_subject` identifies the Google account even if its email changes. A single SQL
statement atomically upserts that connection and creates the browser session.

Apply the migration before deploying the persistence code. Existing credential cookies
are intentionally rejected; users must reconnect once. The public session response still
returns `connected`, `configured`, `email`, and `expiresAt`. With a refresh token,
`expiresAt` now describes browser-session validity, rather than the current access token.

Google Cloud needs no new Calendar scope for offline access; the application supplies
`access_type=offline` and `prompt=select_account consent`. Existing users should reconnect
and grant consent. External OAuth applications in Testing generally receive refresh
tokens lasting seven days with Calendar scopes; production use needs the appropriate
publishing/verification setup. Revoked tokens require reconnection.
See [Google offline access](https://developers.google.com/identity/protocols/oauth2/web-server)
and [refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

Operationally, restrict database access to trusted server environments, retain backups
and the encryption secret securely, and set a retention policy for expired sessions and
unused connections. Rate limiting remains required before broad public rollout. No
production migration is applied by the test suite: it executes this SQL against an
isolated in-memory PostgreSQL instance using the test-only PGlite dependency, with Google
HTTP calls mocked. Live Neon transport and live Google consent still require deployment
validation after an authorized rollout.
