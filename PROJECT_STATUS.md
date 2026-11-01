# QueueLess Project Status

> Update this file at the start and end of every work session. This file
> is committed. Personal investigation notes belong in the ignored
> `decisions/` folder.

## Current release

V1 --- single-clinic pilot.

## Current milestone

M2 --- Authentication, Clinic Configuration & Identity Foundations (Ready for Gate Review).

## Milestone board

| Milestone | Status | Exit gate |
| :--- | :--- | :--- |
| **M0 Environment/repository** | **Completed** | Toolchain, repo, local DB and env verified |
| **M1 Foundation/UI** | **Completed** | Responsive shell, role-aware navbar, and unified staff login reviewed |
| **M2 Identity/clinic/RBAC** | **Completed** | Bootstrap CLI, staff lifecycle, unified login, persistent patient sessions, and RBAC pass |
| M3 Scheduling/appointments | Not started | Slot allocation and concurrent booking tests pass |
| M4 Queue engine | Not started | Queue transitions, token uniqueness and realtime recovery pass |
| M5 Payments | Not started | Verified webhooks, idempotency, refunds and reconciliation tested |
| M6 Notifications/estimates | Not started | Outbox/retry and estimate behaviour tested |
| M7 Localization/accessibility | Not started | English/Hindi/Telugu and assisted/on-site flows verified |
| M8 Hardening | Not started | Integration, E2E, security and failure tests pass |
| M9 Deployment | Not started | Reproducible deployment, backups, monitoring and rollback tested |
| M10 Pilot | Not started | Clinic onboarding and pilot acceptance documented |

## Latest verified state

- **Node.js**: v24.18.0
- **npm**: 11.16.0
- **Git**: 2.53.0
- **MongoDB**: 8.3.2 (Local ping { ok: 1 }; Atlas cluster Cluster0 available)
- **Client Build**: Vite production build succeeded (`371.11 kB` JS / `39.50 kB` CSS in 3.16s)
- **Tests**: 38/38 passing
  - Backend: 30/30 passing across 7 test suites:
    * `test/health.test.js` (3 tests)
    * `test/db.test.js` (1 test)
    * `test/models.test.js` (6 tests)
    * `test/bootstrap.test.js` (2 tests: first initialization & duplicate prevention)
    * `test/staff-auth.test.js` (8 tests: unified login, invitations, password privacy, activation, deactivation)
    * `test/patient-auth.test.js` (6 tests: OTP throttling, persistent cookies, session refresh, family profiles, logout)
    * `test/rbac.test.js` (4 tests: unauthenticated 401, receptionist privilege denial 403, owner admin access 200)
  - Frontend: 8/8 passing across 2 test suites:
    * `test/localization.test.jsx` (5 tests)
    * `test/layout.test.jsx` (3 tests)
- **Documentation Updated**:
  - Centralized Account Management, Patient Identity Permanence, Shared Contact Numbers for Family Members, HttpOnly Persistent OTP Sessions, and Milestone M2/M3 requirements mapped across all 13 reference documents in `QueueLess_Antigravity_Documentation/`.
- **UI Refinements Applied**:
  - Role-aware navbar: unauthenticated visitors only see Home, Book Appointment, Track Live Queue, Language selector, and Staff Login.
  - Staff Login: eliminated role selector dropdown; single common login form (email/password) with backend-driven role routing.
  - Owner Dashboard: functional "Manage Staff" modal with invite, resend, and deactivate actions.
  - Live Queue: replaced hardcoded `A-14` demo state with clean empty state and interactive token search.
- **Deployment**: Local development verified.
- **Known blockers**: None.

## Change log

- **2026-11-01** (Milestone M1):
  - Created shared design tokens and atomic UI components (`Button`, `Badge`, `Card`, `Input`, `Select`, `Modal`, `Alert`).
  - Implemented localization provider supporting English (default), Hindi (`hi`), and Telugu (`te`) with automatic English fallback and persistent preference. Strictly excluded Punjabi.
  - Built Public Clinic Landing page with operating hours and three core action cards.
  - Built Patient Appointment Request flow with stepper, disclaimer, and OTP verification mock.
  - Built Patient Self Check-in flow (reference / mobile) enforcing early check-in window.
  - Built Live Queue Tracker with status indicators, patients ahead, and estimated wait.
  - Built Waiting Room TV Display with high-contrast, privacy-preserving token board.
  - Built Staff Authentication Portal and 3 role dashboard shells (Receptionist, Doctor, Owner).
  - Executed Vitest test suite: 6 frontend tests and 4 backend tests all passing.

- **2026-11-01** (Milestone M0):
  - Initialized Git repository on `main` branch with `develop` branch workflow.
  - Formatted root `.gitignore` properly ensuring `.env*`, `node_modules`, `QueueLess_Antigravity_Documentation/`, and `decisions/` are ignored.
  - Scaffolded application in `queueless-app/` with `server/`, `client/`, and `infrastructure/`.
  - Configured Express 5 backend with Helmet, CORS, Cookie-parser, Morgan, Rate Limiting, and Zod environment schema.
  - Implemented `/api/health` and root `/api` endpoints with centralized error and 404 handling.
  - Verified local MongoDB connectivity via Mongoose and native ping.
  - Scaffolded React 19 + Vite 6 + Tailwind CSS 4 client with production build verification.
  - Executed automated tests: 4 passing in Vitest (`health.test.js`, `db.test.js`).
