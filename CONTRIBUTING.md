# Contributing to QueueLess

## Working principles

1.  Read relevant requirements before changing code.
2.  Keep the modular-monolith architecture; do not introduce
    microservices without an approved architectural change.
3.  Prefer small, reviewable changes with explicit responsibilities.
4.  Validate all untrusted input on the server.
5.  Enforce authorization and clinic scoping server-side.
6.  Persist state before publishing real-time events.
7.  Add or update tests for every behaviour change.
8.  Update public documentation and `PROJECT_STATUS.md`.
9.  Record rationale, investigation, failed approaches and lessons in
    the private local `decisions/` journal.
10. Never claim tests passed unless they were actually run and passed.

## Branching

-   `main`: stable, releasable work.
-   `develop`: integration branch.
-   `feature/<short-description>`: feature work.
-   `fix/<short-description>`: bug fixes.
-   `docs/<short-description>`: documentation-only changes.

Do not work directly on `main` for feature development. Keep branches
focused and merge only after tests and review.

## Commit convention

Use Conventional Commits: -
`feat(queue): implement atomic token generation` -
`fix(payment): prevent duplicate webhook processing` -
`test(appointments): cover concurrent slot allocation` -
`docs(api): clarify appointment confirmation flow` -
`refactor(auth): isolate session validation`

Commits must not include `.env`, credentials, patient data, local logs,
private decision notes or generated secrets.

## Code quality

-   Use descriptive names and small functions.
-   Separate route/controller, application/service,
    persistence/repository and validation responsibilities where
    appropriate.
-   Avoid duplicated business rules across frontend and backend.
-   The frontend may improve usability but must not be trusted to
    enforce business rules.
-   Use typed/validated request and response contracts where practical.
-   Handle errors consistently; do not leak stack traces or secrets to
    clients.
-   Add comments for non-obvious business constraints, not to narrate
    obvious code.

## Pull request / milestone review

A milestone is complete only when its acceptance criteria are met,
relevant tests run, documentation is updated, known limitations are
listed, and the user approves the gate.
