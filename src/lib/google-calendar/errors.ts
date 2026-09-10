export const GOOGLE_MESSAGES = {
  PRAYER_TIMES_UNAVAILABLE:
    "Prayer times are unavailable for this night with the selected source. Check its date coverage and try again.",
  SYNC_IN_PROGRESS:
    "A calendar sync is already running for this account. Wait for it to finish before retrying.",
  SYNC_INCOMPLETE:
    "The sync reached its time limit. Retry to finish; previously synced events will not be duplicated.",
  NOT_CONFIGURED:
    "Google Calendar connection is not configured yet. You can still download the calendar file.",
  CONNECTION_FAILED: "Google Calendar connection failed.",
  PERMISSION_DENIED: "Calendar permission was not granted.",
  SESSION_EXPIRED: "Your Google Calendar session has expired. Please reconnect.",
  UNAUTHENTICATED: "Connect Google Calendar before adding events.",
  INVALID_REQUEST: "Please select valid calendar events and try again.",
  FORBIDDEN: "This calendar request could not be verified. Please reload and try again.",
  EVENT_FAILED: "Unable to create calendar event.",
  RATE_LIMITED: "Google Calendar is busy. Please wait a moment and try again.",
  EVENT_DELETED:
    "This event was previously deleted in Google Calendar. Restore it from Calendar’s trash or change its planned time before adding it again.",
} as const;
export type GoogleErrorCode = keyof typeof GOOGLE_MESSAGES;
export class GoogleCalendarError extends Error {
  constructor(
    public readonly code: GoogleErrorCode,
    public readonly status = 400,
  ) {
    super(GOOGLE_MESSAGES[code]);
  }
}
