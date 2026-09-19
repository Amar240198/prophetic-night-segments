import { isServiceDate } from "./ownership";
import type { CalendarEvent } from "./buildCalendarEvents";
export interface ReconciliationEntry {
  logicalId: string;
  event: CalendarEvent;
}
export interface CurrentCalendarEntry extends ReconciliationEntry {
  providerId: string;
  /** Set only after verification against the signed ownership ledger. */
  ownershipVerified: boolean;
  tombstoned: boolean;
}
export interface ReconciliationScope {
  startDate: string;
  endDate: string;
  allowedLogicalIds: ReadonlySet<string>;
  allowRemoval: boolean;
}
const mutableContent = (event: CalendarEvent) =>
  JSON.stringify([
    event.title,
    event.start,
    event.end,
    event.description,
    event.timeZone,
    event.notificationMinutes,
  ]);
/** Pure planner. Executor must reverify ownership and use conditional provider writes. */
export function planCalendarReconciliation(
  desired: readonly ReconciliationEntry[],
  current: readonly CurrentCalendarEntry[],
  scope: ReconciliationScope,
) {
  if (
    !isServiceDate(scope.startDate) ||
    !isServiceDate(scope.endDate) ||
    scope.startDate > scope.endDate
  )
    throw new Error("INVALID_RECONCILIATION_SCOPE");
  for (const entry of [...desired, ...current]) {
    if (!entry.logicalId || !isServiceDate(entry.event.serviceDate))
      throw new Error("INVALID_RECONCILIATION_ENTRY");
  }
  const create: ReconciliationEntry[] = [];
  const update: Array<{ desired: ReconciliationEntry; current: CurrentCalendarEntry }> = [];
  const keep: CurrentCalendarEntry[] = [];
  const remove: CurrentCalendarEntry[] = [];
  const blocked: string[] = [];
  const inScope = (entry: ReconciliationEntry) =>
    Boolean(
      entry.event.serviceDate &&
      entry.event.serviceDate >= scope.startDate &&
      entry.event.serviceDate <= scope.endDate &&
      scope.allowedLogicalIds.has(entry.logicalId),
    );
  const index = new Map<string, CurrentCalendarEntry>();
  for (const entry of current) {
    if (index.has(entry.logicalId)) throw new Error("DUPLICATE_LOGICAL_ID");
    index.set(entry.logicalId, entry);
  }
  const wanted = new Set<string>();
  for (const entry of desired) {
    if (wanted.has(entry.logicalId)) throw new Error("DUPLICATE_LOGICAL_ID");
    wanted.add(entry.logicalId);
    if (!inScope(entry)) {
      blocked.push(entry.logicalId);
      continue;
    }
    const existing = index.get(entry.logicalId);
    if (!existing) create.push(entry);
    else if (!existing.ownershipVerified || existing.tombstoned || !inScope(existing))
      blocked.push(entry.logicalId);
    else if (mutableContent(entry.event) === mutableContent(existing.event)) keep.push(existing);
    else update.push({ desired: entry, current: existing });
  }
  for (const entry of current) {
    if (
      !wanted.has(entry.logicalId) &&
      scope.allowRemoval &&
      inScope(entry) &&
      entry.ownershipVerified &&
      !entry.tombstoned
    )
      remove.push(entry);
  }
  return { create, update, keep, remove, blocked };
}
