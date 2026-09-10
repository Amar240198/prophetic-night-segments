import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import type { GoogleEventId } from "./plan";
import type { GoogleErrorCode } from "./errors";
import type { SyncMode, SyncSelection } from "./sync";

export type RemovalRequest =
  | { scope: "night"; events: CalendarEvent[]; startDate?: string }
  | {
      scope: "horizon";
      startDate: string;
      mode: SyncMode;
      nights: number;
      selected: GoogleEventId[];
      selectionRevision?: string | null;
    };
export interface RemovalOutcome {
  date?: string;
  id: GoogleEventId;
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
