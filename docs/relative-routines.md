# Relative routine resolution

`src/lib/routines/resolve.ts` is deterministic and does not read the system clock.
Callers provide the account routine, ISO civil service date, IANA timezone and
source-resolved prayer instants or the existing night engine result. Personal
bedtime, wake time and Jumu’ah anchors are explicit local clocks.

Offsets and duration are whole elapsed minutes. Positive offsets follow the
anchor; negative offsets precede it. Offsets can cross midnight without changing
the logical service date. Night boundaries retain the original Maghrib-associated
date. Prayer anchors must belong to the supplied civil date. The resolver uses
B3 for midpoint, B4 for last-third start and B5 for final-sixth start; it does not
calculate prayer times or duplicate the six-part mathematics.

Local personal/fixed clocks use Temporal `disambiguation: reject`: nonexistent
spring clocks and repeated autumn clocks fail explicitly. Supplied prayer and
night instants are already unambiguous. Stable errors are `INVALID_ROUTINE`,
`MISSING_ANCHOR`, `INVALID_ANCHOR`, and `INVALID_ROUTINE_CONTEXT`.

Occurrence identity is routine ID plus service date, scoped to its account in
persistence. Changing title, offset, duration or source time does not change it.
`buildRoutineCalendarEvent` generates desired content; it does not allocate an
ownership ledger identity or write to Google. ICS export remains distinct from
managed remote ownership.

`planCalendarReconciliation` is a pure provider-neutral planner. Its input must
come from a verified ownership ledger and current provider state. It returns
create/update/keep/remove/blocked. Removal requires an explicit allowed logical
identity set, a date range, verified ownership and permission to remove. An
executor must reverify ownership and apply provider concurrency preconditions
before writing. Tombstones are never automatically resurrected.

The routines screen reads and mutates the signed-in account API. Device data is
not silently imported. Its existing daily/weekday recurrence schema is retained;
no migrations 001–005 were changed. Templates are suggestions until saved.
Today resolves available prayer/night routine anchors into its chronological
schedule and reports unavailable timing.

## Remaining integration work

This foundation does not yet provide background reconciliation, routine Google
writes, a personal-anchor settings editor, custom weekday recurrence, fasting
conditioned templates, window-based routines, notification delivery, trial or
billing. The existing Google scheduler paths are unchanged. The 100-routine limit
is a resource cap, not a consumer free tier or subscription entitlement. Account
entitlements must be enforced when managed automation is connected.
