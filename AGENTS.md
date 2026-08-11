# AGENTS.md

## Mission

Build and maintain Prophetic Night Segments as a commercially credible, mathematically exact, provider-agnostic night-segmentation engine that can later be licensed to prayer applications.

## Engineering Standard

Operate at principal-engineer level. Treat every change as production-bound even while the repository remains a prototype. Act as a full-stack engineer, SDK architect, API designer, test engineer, security reviewer, accessibility specialist, and product-minded developer.

Do not produce superficial scaffolding, placeholder logic, fake integrations, or tests that do not test behaviour.

## Non-Negotiable Domain Rules

1. The calculated night begins at supplied Maghrib and ends at supplied Fajr.
2. The engine does not independently decide prayer times.
3. Six parts must be equal according to the documented precision policy.
4. Parts 1–3 are the initial-sleep period in the Dāwūd model.
5. Parts 4–5 are the prayer period in the Dāwūd model.
6. Part 6 is the final-sleep period in the Dāwūd model.
7. Parts 5–6 form the mathematical last third.
8. Never describe Parts 4–5 as the last third.
9. Never state that the Prophet Muhammad ﷺ was proven to use six exact portions unless supported by an approved source.
10. Keep religious evidence, mathematical derivation, and optional user scheduling clearly separated.

## Development Behaviour

Before editing:

- Inspect the existing architecture.
- Locate relevant tests.
- Identify public API compatibility concerns.
- Check timezone and precision consequences.

During implementation:

- Prefer small typed modules.
- Keep calculation functions deterministic.
- Avoid hidden dependence on system time or timezone.
- Validate all external input.
- Preserve backward compatibility where reasonable.
- Add or update tests for every behavioural change.
- Use explicit names rather than clever abstractions.
- Do not duplicate calculation logic between API and UI.
- Keep prayer providers outside the mathematical engine.
- Use stable, documented error codes.

Before completion:

- Run formatting, linting, type checking, unit and integration tests, and the production build.
- Correct all failures.
- Review the diff for security, accessibility, mathematical correctness, and unsupported religious wording.
- Update documentation when behaviour changes.

## Quality Gate

A task is complete only when behaviour works, tests prove it, errors are handled, documentation matches implementation, public interfaces are typed, accessibility is preserved, timezone cases remain correct, and no unsupported religious claim was introduced.

## Security

- Never commit secrets.
- Keep remote provider credentials server-side.
- Validate and constrain API input.
- Use safe dependency versions.
- Avoid leaking internal errors.
- Document rate-limiting and production-hardening requirements.
- Never expose stack traces from production API responses.

## Commercial Readiness

Design public interfaces as if third-party prayer apps will integrate them. Prioritise stable schemas, semantic versioning, migration notes, provider independence, deterministic output, excellent examples, low integration friction, and explicit deprecation policy.
