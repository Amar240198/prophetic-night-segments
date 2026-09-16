import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import type { GoogleErrorCode } from "./errors";
import type { SyncMode, SyncSelection } from "./sync";

export type RemovalRequest =
  | { scope: "night"; events: CalendarEvent[]; startDate?: string; selected?: never }
  | { scope: "night"; selected: string[]; startDate: string; events?: never }
  | {
      scope: "horizon";
      startDate: string;
      mode: SyncMode;
      nights: number;
      selected: string[];
      /** Explicitly authorises every persisted event kind within this date range. */
      allEventTypes?: boolean;
      selectionRevision?: string | null;
    };
export interface RemovalOutcome {
  date?: string;
  id: string;
  identity: "one-night" | "mapped";
  status: "removed" | "absent" | "failed";
  code?: GoogleErrorCode;
}
export interface RemovalResult {
  scope: RemovalRequest["scope"];
  nights: number;
  outcomes: RemovalOutcome[];
  syncSelection?: SyncSelection;
}
