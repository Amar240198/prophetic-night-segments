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
Copy these four variable names from `.env.example` and fill them in:

```dotenv
GOOGLE_CLIENT_ID=your-web-application-client-id
GOOGLE_CLIENT_SECRET=your-web-application-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
GOOGLE_SESSION_SECRET=your-generated-base64-secret
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

4. Treat the client secret and session secret as sensitive values. Do not publish
   them or add them to client-side variables.
5. Open **Deployments**, select the latest production deployment, and choose
   **Redeploy**. Environment changes take effect on a new deployment.
6. Visit **https://prophetic-night-segments.vercel.app** and repeat the connection
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
| Connection is not configured        | Set all four environment variables and restart/redeploy.                                                                               |
| `redirect_uri_mismatch` from Google | Match the callback URI exactly in Google and the environment.                                                                          |
| Access blocked in Testing           | Add the signing-in email under Google Auth Platform → Audience → Test users.                                                           |
| Calendar permission was not granted | Reconnect and approve the Calendar permission. Confirm the Calendar API is enabled. Workspace admins may restrict access.              |
| Google Calendar connection failed   | Retry sign-in. Check client ID/secret, callback URI, and session secret. Restart the flow if the popup has been open over ten minutes. |
| Session has expired                 | Reconnect. This prototype deliberately does not retain refresh tokens.                                                                 |
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
- The encrypted cookie contains an access token and email. There is no user database,
  no localStorage token, and no refresh token storage. Sessions expire after Google's
  access-token lifetime, capped at one hour; users reconnect to continue. Rotating
  the session secret invalidates all cookies. No background scheduling or sync runs.
- Disconnect attempts Google token revocation and always clears local cookies. If
  revocation fails, the UI says so; users can remove the app from their Google
  Account's third-party connections. Stateless cookies cannot provide a centralized
  per-session revocation list. A copied cookie remains usable until expiry if Google
  revocation fails. A public long-lived service should use a server-side session store.
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
