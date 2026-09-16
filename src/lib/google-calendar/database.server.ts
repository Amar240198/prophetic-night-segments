import { neon } from "@neondatabase/serverless";
import { GoogleCalendarError } from "./errors";

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new GoogleCalendarError("NOT_CONFIGURED", 503);
  return neon(url, { fetchOptions: { signal: AbortSignal.timeout(10_000) } });
}

export interface StoredSession {
  connection_id: string;
  google_subject: string;
  google_account_email: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  access_token_expires_at: string;
  session_expires_at: string;
}

export async function persistConnection(input: {
  connectionId: string;
  subject: string;
  email: string;
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: string;
  sessionHash: string;
  sessionExpiresAt: string;
}) {
  // A single statement atomically upserts the account and creates its session.
  await database()`
    WITH connection AS (
      INSERT INTO google_connections
        (id, google_subject, google_account_email, encrypted_access_token,
         encrypted_refresh_token, access_token_expires_at)
      VALUES (${input.connectionId}, ${input.subject}, ${input.email}, ${input.accessToken},
              ${input.refreshToken}, ${input.accessExpiresAt})
      ON CONFLICT (provider, google_subject) DO UPDATE SET
        google_account_email = EXCLUDED.google_account_email,
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        encrypted_refresh_token = COALESCE(EXCLUDED.encrypted_refresh_token, google_connections.encrypted_refresh_token),
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        disconnected_at = NULL,
        updated_at = now()
      RETURNING id
    )
    INSERT INTO browser_sessions (id, google_connection_id, expires_at)
    SELECT ${input.sessionHash}, id, ${input.sessionExpiresAt}::timestamptz FROM connection
  `;
}

export async function findSession(hash: string): Promise<StoredSession | null> {
  const rows = await database()`
    SELECT c.id AS connection_id, c.google_subject, c.google_account_email,
      c.encrypted_access_token, c.encrypted_refresh_token, c.access_token_expires_at,
      s.expires_at AS session_expires_at
    FROM browser_sessions s JOIN google_connections c ON c.id = s.google_connection_id
    WHERE s.id = ${hash} AND c.provider = 'google' AND c.disconnected_at IS NULL
      AND c.encrypted_access_token IS NOT NULL
  `;
  return (rows[0] as StoredSession | undefined) ?? null;
}

export async function updateTokens(
  row: StoredSession,
  access: string,
  refresh: string | null,
  expiry: string,
) {
  // Compare-and-swap: a late refresh must not overwrite a newer login/refresh.
  await database()`UPDATE google_connections SET encrypted_access_token = ${access},
    encrypted_refresh_token = COALESCE(${refresh}, encrypted_refresh_token),
    access_token_expires_at = ${expiry}, updated_at = now()
    WHERE id = ${row.connection_id} AND provider = 'google' AND disconnected_at IS NULL
      AND encrypted_access_token = ${row.encrypted_access_token}`;
}

export async function deleteSession(hash: string) {
  await database()`DELETE FROM browser_sessions WHERE id = ${hash}`;
}

export async function deleteConnection(hash: string): Promise<StoredSession | null> {
  // Retain the durable account and event ledger; credentials and sync eligibility are erased.
  const rows = await database()`WITH target AS MATERIALIZED (
    SELECT c.id AS connection_id, c.google_subject, c.google_account_email,
      c.encrypted_access_token, c.encrypted_refresh_token, c.access_token_expires_at,
      s.expires_at AS session_expires_at FROM google_connections c JOIN browser_sessions s
      ON s.google_connection_id = c.id WHERE s.id = ${hash} AND s.expires_at > now()
      AND c.provider = 'google' AND c.disconnected_at IS NULL FOR UPDATE OF c
  ), disconnected AS (
    UPDATE google_connections SET encrypted_access_token = NULL, encrypted_refresh_token = NULL,
      access_token_expires_at = NULL, disconnected_at = now(), updated_at = now()
    WHERE id IN (SELECT connection_id FROM target)
  ), sessions AS (
    DELETE FROM browser_sessions WHERE google_connection_id IN (SELECT connection_id FROM target)
  ), preferences AS (
    DELETE FROM google_calendar_sync_preferences WHERE google_connection_id IN (SELECT connection_id FROM target)
  ), leases AS (
    DELETE FROM google_calendar_sync_leases WHERE google_connection_id IN (SELECT connection_id FROM target)
  ) SELECT * FROM target`;
  return (rows[0] as StoredSession | undefined) ?? null;
}
