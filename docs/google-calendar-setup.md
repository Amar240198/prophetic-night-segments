# Google Calendar setup

The current integration connects in **read mode** first. Follow the exact production setup, migration and acceptance steps in [Miqāt calendar intelligence](miqat-calendar-intelligence.md#rollout).

The linked Vercel project is **sixth-of-the-night**, with callback:

```text
https://sixth-of-the-night.vercel.app/api/google-calendar/callback
```

Local development callback:

```text
http://localhost:3000/api/google-calendar/callback
```

Reuse the existing Google Cloud Web application client. Enable Google Calendar API. Initial consent requests `calendar.readonly` and the existing `userinfo.email` identity scope. Only the explicit **Allow Miqāt to manage calendar events** POST requests `calendar.events`. Historical `calendar.events.owned` connections need reconnection for read analysis; the application no longer requests that scope.

Server-only variables: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_SESSION_SECRET`. Keep the existing encryption secret stable; rotating it invalidates encrypted tokens. New deployments must set `CALENDAR_WRITES_ENABLED=false`. Apply migrations 001–011 in order. No real secrets belong in `.env.example` or browser code.

Open `/app/settings` while signed in to confirm prayer settings. Pro accounts connect read access and select calendars in Settings → Calendar. Today and Calendar display daily analysis; Automations owns scheduling preferences. Preview blocks without enabling writes. Production write enablement is a separate acceptance step; a successful deployment does not constitute write approval.

OAuth uses random state bound to the current app user, PKCE S256, a ten-minute encrypted flow cookie, server token exchange, opaque sessions, AES-GCM encrypted access/refresh credentials and refresh-token support. Declined/revoked grants require reconnection. Disconnect removes local credentials and selections before attempting provider revocation; it leaves existing external events in place.

Read requests and disconnect remain available while writes are disabled. Calendar errors do not disable the public prayer or Sixth of the Night calculation routes or ICS exports. Never work around consent errors by broadening permissions or exposing credentials to the frontend.

See [historical managed-event ownership](google-calendar-sync.md), [privacy](privacy.md), [Google scope definitions](https://developers.google.com/workspace/calendar/api/auth), and [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).
