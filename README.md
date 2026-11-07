# QueueLess

> Intelligent, real-time clinic appointment coordination and queue management engineered for community clinics and outpatient healthcare practices.

**🌐 Live Demo:** [https://queueless-clinic-aarogyam.onrender.com](https://queueless-clinic-aarogyam.onrender.com)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-00c7b7?style=flat-square&logo=render&logoColor=white)](https://queueless-clinic-aarogyam.onrender.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.1-lightgrey.svg)](https://expressjs.com)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8.svg)](https://tailwindcss.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-8-green.svg)](https://www.mongodb.com)
[![Automated Tests](https://img.shields.io/badge/Tests-165%20Passing-brightgreen.svg)](https://vitest.dev)
[![E2E Tests](https://img.shields.io/badge/Playwright-9%20Passing-blue.svg)](https://playwright.dev)

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Problem Statement & Objectives](#2-problem-statement--objectives)
- [3. Key Features by Role](#3-key-features-by-role)
  - [Clinic Owner](#clinic-owner)
  - [Reception Desk](#reception-desk)
  - [Doctor Consultation Console](#doctor-consultation-console)
  - [Patient Experience](#patient-experience)
  - [Waiting Room TV Display](#waiting-room-tv-display)
- [4. Core Workflows](#4-core-workflows)
  - [A. Online Booking & 5-Minute Slot Hold](#a-online-booking--5-minute-slot-hold)
  - [B. Walk-In Registration & On-Site Check-In](#b-walk-in-registration--on-site-check-in)
  - [C. Consultation Flow & Clinical Safety Lock](#c-consultation-flow--clinical-safety-lock)
- [5. Technology Stack](#5-technology-stack)
- [6. High-Level Architecture](#6-high-level-architecture)
- [7. Repository Structure](#7-repository-structure)
- [8. Prerequisites & Installation](#8-prerequisites--installation)
- [9. Environment Configuration](#9-environment-configuration)
- [10. Running the Application & Test Suites](#10-running-the-application--test-suites)
- [11. Security, Authorization & Privacy](#11-security-authorization--privacy)
- [12. Implementation Status](#12-implementation-status)
- [13. Contributing](#13-contributing)
- [14. License & Acknowledgements](#14-license--acknowledgements)

---

## 1. Overview

**QueueLess** is an India-first clinic appointment, queue management, and patient coordination platform. Tailored for outpatient healthcare practices with high patient volume, QueueLess bridges online appointment booking, reception review, doctor consultation rooms, and walk-in queues into an auditable, real-time workflow.

V1 supports single-clinic multi-doctor operations across specialized medical departments (e.g., General Medicine, Pediatrics, Orthopedics) with trilingual localization (**English**, **Hindi**, and **Telugu**).

---

## 2. Problem Statement & Objectives

### The Problem
- **Chaotic Waiting Rooms:** Crowded outpatient waiting areas cause patient fatigue, unpredictable wait times, and high receptionist stress.
- **Appointment No-Shows & Overbooking:** Clinics suffer financial loss when unconfirmed bookings hold slots indefinitely or multiple patients arrive simultaneously without prioritized queuing.
- **Walk-In vs. Scheduled Imbalance:** Walk-in patients often get turn priority ahead of patients who reserved slots hours or days in advance.
- **Language & Accessibility Barriers:** Diverse patient demographics need multi-language auditory and visual turn announcements in lobby waiting areas.

### Objectives
1. **Zero-Friction Scheduling:** Provide passwordless phone OTP booking with a strict 5-minute slot reservation window.
2. **Clinical Safety Guarantee:** Enforce single-patient consultation locks preventing concurrent interruption while a doctor is actively treating a patient.
3. **Hybrid Queue Balance:** Interleave on-site walk-ins and pre-booked appointments fairly based on arrival time, slot confirmation, and emergency priority.
4. **Accessible Lobby Broadcast:** Provide a high-contrast lobby TV display with an automated multi-tone chime bell and trilingual synthetic voice announcements.

---

## 3. Key Features by Role

### Clinic Owner
- **Onboard Staff & Doctors:** Invite doctors and receptionists with Gmail activation links and assigned departments.
- **Doctor Roster & Room Assignments:** Map doctors to room numbers, consultation schedules, and active medical departments.
- **Operational Metrics:** Real-time visibility into total daily patients, revenue collections, refunds, and active queue counts.
- **Audit Trails:** Immutable audit logging of all sensitive administrative actions (invitations, role changes, slot cancellations).

### Reception Desk
- **Queue Overview:** Live feed of serving, waiting, and completed patients with FIFO token management.
- **Walk-In Registration:** Register on-site walk-in patients (₹0 advance deposit policy) with automatic age categorization:
  - *Pediatric:* < 18 years
  - *Adult:* 18–59 years
  - *Senior Citizen:* 60+ years
- **Department & Doctor Verification:** Automatic doctor dropdown filtering ensuring only doctors registered by the owner under the selected department can be assigned.
- **Review Pending Requests:** Allocate doctors and time slots for online requests, or re-allocate expired slot holds.
- **Assisted Check-In:** Desk QR/token check-in verifying patient arrival and activating priority in the live queue.
- **Lobby TV Control:** Modal to toggle TV broadcast ON/OFF, enable/disable patient name privacy, and set announcement language (English, Telugu, Hindi).
- **Cancellation & Refunds:** 1-click Razorpay payment refund triggering when appointments are cancelled at the desk.

### Doctor Consultation Console
- **Clinical Safety Lock:** Strict state engine ensuring next patient cannot be called while a consultation is in progress.
- **Queue Calling:** Call next patient with one click; triggers real-time WebSocket broadcast and waiting room TV chime.
- **Consultation Lifecycle:** Clear action transitions: `CALL NEXT` ➔ `START CONSULTATION` ➔ `COMPLETE CONSULTATION`.
- **Emergency Priority Interleaving:** Emergency walk-ins automatically route to the very next eligible slot without interrupting ongoing consultations.

### Patient Experience
- **Passwordless Mobile Login:** Quick 6-digit OTP verification sent to cellular SMS with rate limiting (60-second cooldown, max 5 requests/hour).
- **Online Booking:** Select preferred window (Morning / Evening) and medical complaint.
- **5-Minute Slot Hold & Deposit:** Slot held exclusively for 5 minutes while completing commitment deposit via Razorpay UPI / Netbanking.
- **Live Queue Tracker:** Real-time mobile queue tracking showing current token being served, estimated wait time, and room number.
- **Trilingual Support:** Native instant UI switching between English, Hindi (हिंदी), and Telugu (తెలుగు).

### Waiting Room TV Display
- **Lobby Display (`/waiting-room`):** High-contrast TV theme showing current serving token, room number, doctor name, and upcoming queue.
- **Digital Chime Bell:** In-browser Web Audio API two-tone hospital chime (659.25 Hz & 523.25 Hz) when a new token is called.
- **Multilingual Voice Announcements:** Text-to-Speech synthesizer announcing token number and patient name in English (`en-IN`), Telugu (`te-IN`), or Hindi (`hi-IN`).
- **Privacy Mode:** Receptionist can toggle between displaying/speaking patient names or showing token numbers only.

---

## 4. Core Workflows

### A. Online Booking & 5-Minute Slot Hold

```
[Patient requests appointment]
             │
             ▼
[Receptionist reviews & allocates Doctor + Slot Date/Time]
             │
             ▼
[Slot held for 5 minutes] ──(Expired)──► [Status: HOLD_EXPIRED]
             │                                   │
             ▼ (Within 5 min)             [Receptionist Re-allocates]
[Patient pays ₹100 Deposit via Razorpay]
             │
             ▼
[Appointment Confirmed & Booking Reference Generated (e.g. QL-L2RCK7)]
```

### B. Walk-In Registration & On-Site Check-In

```
[Walk-in patient arrives at clinic]
             │
             ▼
[Receptionist registers Name, Age, Gender, Department]
             ├─ Age-category advisory detected (Pediatric / Adult / Senior)
             └─ Dropdown filters doctors strictly by selected Department
             │
             ▼
[FIFO Token generated with ₹0 deposit policy]
             │
             ▼
[Patient enters waiting lobby and watches Live TV Display]
```

### C. Consultation Flow & Clinical Safety Lock

```
[Doctor in Room 101 clicks "Call Next"]
             │
             ▼
[WebSocket Broadcast to TV Display & Waiting Room Chime Rings 🔔]
             │
             ▼
[Patient arrives in Room] ──► [Doctor clicks "Start Consultation"]
                                         │
                        [Clinical Safety Rule Enforced: "In Progress"]
                        (Doctor cannot call next patient until completed)
                                         │
                                         ▼
                             [Doctor clicks "Complete"]
                                         │
                                         ▼
                            [Room Ready for Next Patient]
```

---

## 5. Technology Stack

### Frontend
- **Framework:** [React 19](https://react.dev) + [Vite 6](https://vitejs.dev)
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com)
- **Icons:** [Lucide React](https://lucide.dev)
- **Real-Time Client:** [Socket.IO Client](https://socket.io)
- **Routing:** [React Router DOM v7](https://reactrouter.com)
- **Testing:** [Vitest 5](https://vitest.dev) + [@testing-library/react](https://testing-library.com) + JSDOM

### Backend
- **Runtime:** [Node.js](https://nodejs.org) (v20+ LTS)
- **Framework:** [Express 5](https://expressjs.com)
- **Database ODM:** [Mongoose 8](https://mongoosejs.com) (MongoDB 8)
- **Real-Time Engine:** [Socket.IO 4](https://socket.io)
- **Validation:** [Zod 3](https://zod.dev)
- **Security:** [Helmet](https://helmetjs.github.io), [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit), [bcrypt](https://github.com/kelektiv/node.bcrypt.js), `httpOnly` signed session cookies
- **Payment Processing:** [Razorpay Orders & Webhooks API](https://razorpay.com/docs/api/)
- **SMS Gateway Service:** Multi-provider gateway supporting [Twilio](https://www.twilio.com), [Fast2SMS](https://www.fast2sms.com), and [2Factor.in](https://2factor.in)
- **Email Service:** [Nodemailer](https://nodemailer.com) (SMTP)
- **Testing:** [Vitest 3](https://vitest.dev) + [Supertest](https://github.com/ladjs/supertest)

---

## 6. High-Level Architecture

```
                    ┌─────────────────────────────────────────┐
                    │               Web Browsers              │
                    │   (Mobile Patient, Reception, Doctor,   │
                    │        Owner, Waiting Room TV)          │
                    └────────────────────┬────────────────────┘
                                         │  HTTPS / WSS
                                         ▼
                    ┌─────────────────────────────────────────┐
                    │             Express 5 API               │
                    │      (Helmet, Rate Limits, CORS)        │
                    └──────┬─────────────┬─────────────┬──────┘
                           │             │             │
              ┌────────────┴──┐   ┌──────┴─────┐  ┌────┴────────────┐
              │ Auth Middleware│   │ Controllers│  │ Socket.IO Server│
              │  (RBAC, HMAC)  │   │ & Services │  │ (Live Room Bus) │
              └───────────────┘   └──────┬─────┘  └─────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        ▼                                ▼                                ▼
┌───────────────┐              ┌──────────────────┐             ┌──────────────────┐
│ MongoDB Atlas │              │ Razorpay Gateway │             │  SMS & Email GW  │
│ (Transactions,│              │ (Orders, Verify, │             │ (Twilio, 2Factor,│
│  Audit Logs)  │              │     Refunds)     │             │ Fast2SMS, SMTP)  │
└───────────────┘              └──────────────────┘             └──────────────────┘
```

---

## 7. Repository Structure

```
QueueLess/
├── queueless-app/
│   ├── client/                          # React + Vite Frontend
│   │   ├── src/
│   │   │   ├── components/ui/           # Reusable UI primitives (Button, Card, Input, Badge)
│   │   │   ├── context/                 # LanguageContext, AuthContext, PatientAuthContext
│   │   │   ├── locales/                 # Trilingual dictionary (en.json, hi.json, te.json)
│   │   │   ├── pages/                   # Application pages & Dashboards
│   │   │   │   ├── dashboards/          # OwnerDashboard, ReceptionistDashboard, DoctorDashboard
│   │   │   │   ├── PatientBooking.jsx   # Online booking flow & 5-minute hold timer
│   │   │   │   ├── PatientQueue.jsx     # Live patient position tracker & deposit actions
│   │   │   │   ├── WaitingRoomDisplay.jsx # TV Lobby display with chime & audio synthesis
│   │   │   │   └── StaffLogin.jsx       # Unified staff credentials entry
│   │   │   ├── App.jsx                  # Protected routes & role-based routing
│   │   │   └── main.jsx                 # Client entry point
│   │   ├── test/                        # Vitest client suites (assisted-desk, layout, localization)
│   │   └── package.json
│   ├── server/                          # Node.js + Express 5 API Server
│   │   ├── src/
│   │   │   ├── config/                  # Environment validation (Zod), database, socket.io
│   │   │   ├── middleware/              # Auth, RBAC, rate-limiting, error handlers
│   │   │   ├── models/                  # 20 Mongoose domain models (Clinic, Doctor, Appointment...)
│   │   │   ├── routes/                  # Express API routers (v1 staff, patient, queue, payments)
│   │   │   ├── scripts/                 # Bootstrap & seeding scripts
│   │   │   ├── services/                # Business logic (queue, appointment, payment, sms, email)
│   │   │   └── index.js                 # Server entry point
│   │   ├── test/                        # 13 backend test suites (concurrency, queue, rbac, payments...)
│   │   └── package.json
│   ├── .env.example                     # Environment template with dummy placeholders
│   └── package.json                     # Monorepo orchestration scripts
├── .gitignore                           # Git exclusion rules
└── README.md                            # Project documentation
```

---

## 8. Prerequisites & Installation

### Prerequisites
- **Node.js:** v20.0.0 or higher
- **npm:** v10.0.0 or higher
- **MongoDB:** MongoDB 7.0+ or MongoDB Atlas cluster (Replica Set recommended for atomic session transactions)

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nallurinithin/queueless.git
   cd queueless
   ```

2. **Install root orchestration dependencies:**
   ```bash
   cd queueless-app
   npm install
   ```

3. **Install Server & Client dependencies:**
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd ..
   ```

---

## 9. Environment Configuration

Create a `.env` file in `queueless-app/server/.env` based on `.env.example`:

```bash
cp .env.example server/.env
```

### Server Variables (`server/.env`):
```env
# Server Configuration
PORT=5000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173

# Database Connection (Local or Atlas Replica Set)
MONGODB_URI=mongodb://127.0.0.1:27017/queueless_dev?directConnection=true

# Session Security (Minimum 32-character secure random string)
SESSION_SECRET=your_32_character_secure_random_session_secret_here

# Payment Gateway (Razorpay Sandbox or Live)
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=rzp_secret_placeholder
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret_here

# Email Delivery (SMTP for Staff Invitations)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_clinic_email@gmail.com
SMTP_PASS=your_gmail_app_password

# SMS Gateway (Twilio / 2Factor / Fast2SMS)
TWILIO_ACCOUNT_SID=AC_twilio_account_sid_placeholder
TWILIO_AUTH_TOKEN=your_twilio_auth_token_placeholder
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
# FAST2SMS_API_KEY=your_fast2sms_key_placeholder
# TWO_FACTOR_API_KEY=your_2factor_key_placeholder

# Logging
LOG_LEVEL=info
```

---

## 10. Running the Application & Test Suites

### Development Mode
From the `queueless-app/` root directory, launch both backend and frontend concurrently:

```bash
npm run dev
```
- **Backend API:** `http://localhost:5000/api`
- **Frontend App:** `http://localhost:5173`
- **Waiting Room TV:** `http://localhost:5173/waiting-room`

### Running Server Only
```bash
npm run dev:server
```

### Running Client Only
```bash
npm run dev:client
```

### Automated Testing

The codebase includes **165 automated tests** across 22 test files spanning unit, integration, concurrency, security, and real-browser Playwright end-to-end suites:

```bash
# 1. Run all Monorepo Vitest tests (Server + Client concurrently)
npm test

# 2. Run Server tests only (144 tests across 16 suites)
npm run test:server

# 3. Run Client tests only (12 tests across 3 suites)
npm run test:client

# 4. Run Playwright Multi-Role Browser E2E Tests (9 tests across 3 suites)
cd tests/e2e
npx playwright test
```

#### Test Suite Breakdown:
- **Backend Vitest Suites (144 passing):**
  - `concurrency-integrity.test.js` (Adversarial race tests: doctor room exclusivity, idempotent check-in, crash recovery via version CAS, consultation exclusivity, and 50-request slot allocations)
  - `security-audit.test.js` (21 tests: SEC-01 through SEC-09, timing-safe authentication, session revocation, NoSQL sanitization, IDOR guards)
  - `owner-policy-configuration.test.js` (20 tests: Deposit/cancellation policy configuration, snapshot immutability, ₹0 walk-in invariant)
  - `payments.test.js` (16 tests: Razorpay order lifecycle, cryptographic HMAC signatures, webhook idempotency, refunds, Test/Live mode separation)
  - `e2e-hardening.test.js` (13 tests: End-to-end clinic lifecycle integration, clinical safety locks)
  - `concurrency.test.js` (1 test: 50 concurrent requests for 1 slot)
  - `queue.test.js` (6 tests: FIFO ordering, emergency walk-in interleaving, clinical safety locks)
  - `db.test.js` (5 tests: Database connectivity, admin ping, and fail-closed test database isolation guard)
  - `rbac.test.js` (4 tests: Clinic isolation and role boundaries)
  - `notifications.test.js` (9 tests: Outbox delivery retries and deduplication)
  - `patient-auth.test.js` (6 tests: OTP generation, rate limits, 60s cooldowns)
  - `appointments.test.js`, `staff-auth.test.js`, `bootstrap.test.js`, `models.test.js`, `health.test.js`
- **Frontend Vitest Suites (12 passing):**
  - `assisted-desk.test.jsx` (Assisted check-in, walk-in token issuance, TV display ARIA live regions)
  - `localization.test.jsx` (Dynamic translation switching between English, Hindi, and Telugu)
  - `layout.test.jsx` (Navigation bar branding, auth shell routing, role navigation)
- **Playwright Browser E2E Suites (9 passing across isolated browser contexts):**
  - `role-workflows.spec.js` (4 tests: Patient, Receptionist, Doctor, and Clinic Owner journeys)
  - `cross-role-journeys.spec.js` (4 tests: Remote booking full cycle, Walk-in flow, Timed cancellation, Owner policy changes & snapshot immutability)
  - `multi-user-queue-flow.spec.js` (1 test: Concurrent 4-context real-time queue orchestration with waiting room TV)

---

## 11. Security, Authorization & Privacy

- **Role-Based Access Control (RBAC):** Three distinct staff roles (`CLINIC_OWNER`, `RECEPTIONIST`, `DOCTOR`) with route-level middleware guards (`requireStaffAuth`, `requireRole`).
- **Clinic Scoping:** Every sensitive database query scopes strictly by `clinicId` to ensure multi-tenant security isolation.
- **Session Protection:** Session identifiers stored in encrypted, signed, `httpOnly`, `SameSite=Lax` cookies, preventing XSS token exfiltration.
- **Credential Storage:** All passwords hashed using `bcrypt` (12 rounds) with zero plaintext credential persistence.
- **Payment Verification:** Cryptographic HMAC SHA-256 verification of Razorpay signatures before confirming transactions.
- **Patient Privacy:** Public waiting room display operates with a configurable toggle allowing clinics to conceal patient names and announce tokens only.

---

## 12. Implementation Status

| Feature Area | Status | Verification |
| :--- | :---: | :--- |
| **Passwordless Patient Login** | ✅ Implemented | Verified with rate limits, 60s cooldown, SHA-256 hashed OTPs |
| **Online Appointment Booking** | ✅ Implemented | Tested with 5-minute atomic slot reservation |
| **Razorpay Payments & Refunds** | ✅ Implemented | Live order creation, signature checks, and full refunds |
| **Walk-In Registration** | ✅ Implemented | ₹0 deposit FIFO tokens with age categorization |
| **Doctor-Department Filtering** | ✅ Implemented | Real-time dropdown filtering preventing empty department bookings |
| **Waiting Room TV Lobby Display** | ✅ Implemented | Web Audio chime, multilingual voice synthesis, privacy toggles |
| **Clinical Safety Lock** | ✅ Implemented | Prevents doctors from calling next patient mid-consultation |
| **Concurrency & Storage Integrity** | ✅ Implemented | Tested under 300+ adversarial concurrent requests; doctor room exclusivity, idempotent check-in crash recovery via version CAS, consultation exclusivity |
| **Trilingual Localization** | ✅ Implemented | Full English, Hindi, and Telugu UI coverage |
| **Multi-Clinic SaaS Architecture** | ⏳ In Progress | V1 single-clinic operational; schema prepared for multi-tenant expansion |
| **Direct WhatsApp Sandbox Dispatch** | 📋 Planned | Ready for Meta WhatsApp Business API integration |

---

## 13. Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit your changes adhering to conventional commit format:
   ```bash
   git commit -m "feat: description of feature"
   ```
4. Verify that all 110 automated tests pass before opening a pull request:
   ```bash
   npm test
   ```
5. Push to your branch and submit a Pull Request against `develop`.

---

## 14. License & Acknowledgements

### License
This project is licensed under the [MIT License](LICENSE).

### Acknowledgements
- Built with modern full-stack web technologies: [React](https://react.dev), [Tailwind CSS](https://tailwindcss.com), [Node.js](https://nodejs.org), [Express](https://expressjs.com), and [MongoDB](https://www.mongodb.com).
- Payment processing powered by [Razorpay](https://razorpay.com).
- SMS services powered by [Twilio](https://twilio.com), [Fast2SMS](https://fast2sms.com), and [2Factor](https://2factor.in).
