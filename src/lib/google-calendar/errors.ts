export const GOOGLE_MESSAGES = {
  CALENDAR_MAINTENANCE:
    "Calendar changes are temporarily unavailable during maintenance. Please try again shortly.",
  SERVICE_DATE_REQUIRED:
    "Reload the night planner before adding or removing events. The original Maghrib night date is required.",
  IDENTITY_CONFLICT:
    "This calendar identity does not match the authorised night or account. The event was left unchanged.",
  REMOVE_FAILED: "Unable to remove this calendar event. Retry removal safely.",
  EVENT_NOT_OWNED: "This event could not be verified as app-owned and was left unchanged.",
  EVENT_CHANGED:
    "This event changed during the operation and was left unchanged. Review it and retry.",
  REMOVE_INCOMPLETE:
    "Removal reached its time limit. Retry to finish; remaining mappings were preserved.",
  SELECTION_CHANGED:
    "Saved calendar selections changed in another request. Check connection to reload them, then review your choices.",
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
    "This event was previously removed. Restore it in Google Calendar before syncing again. Changing its time will not create a replacement.",
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
