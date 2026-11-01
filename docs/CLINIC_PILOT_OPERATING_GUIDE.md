# QueueLess — Aarogyam Community Clinic Pilot Operating Guide

**Version:** 1.0.0-pilot  
**Target Facility:** Aarogyam Community Clinic, Hyderabad, Telangana  
**System Classification:** India-First Clinic Queue & Appointment Management Platform (Modular Monolith)

---

## 1. Executive Summary & Pilot Scope

QueueLess is deployed at Aarogyam Community Clinic to eliminate chaotic morning waiting crowds, coordinate scheduled arrivals with walk-in consultations, and ensure patient privacy.

### Core Principles for All Clinic Staff
1. **Patient Data Permanence:** Patient clinical identity persists permanently across visits. Patient records are **never wiped daily**.
2. **Contact Number Decoupling:** Mobile numbers represent contact channels, not unique patient identities. Multiple family members (e.g. parents, spouses, children) legitimately share a single mobile number.
3. **Clinical Consultation Safety Lock:** An active consultation cannot be interrupted by the receptionist desk or other staff. Attempting to skip or reassign a patient currently in doctor consultation returns an immediate clinical lock (`409 Conflict`).
4. **Privacy-Preserving Public Display:** Waiting room screens show only monotonic sequence tokens (e.g., `A-101`, `W-102`) and doctor room designations. Patient names, diagnoses, and phone numbers are strictly prohibited from public displays.
5. **No Advance Deposit for Walk-Ins:** In-person walk-in patients pay ₹0 advance deposit at the desk. The ₹100 deposit applies only to remote scheduled appointments held for 5 minutes.

---

## 2. Authentication & Clinic Access Portal

All clinic staff (Clinic Owner, Doctors, Receptionists) authenticate via a single, unified login portal:

- **Portal URL:** `http://<clinic-domain-or-ip>/staff/login`
- **Interface:** Single email and password form with **no role selector dropdown**.
- **Role Routing:** The backend validates credentials, evaluates the staff role, and automatically routes the user:
  - `CLINIC_OWNER` $\rightarrow$ `/owner/dashboard`
  - `RECEPTIONIST` $\rightarrow$ `/receptionist/dashboard`
  - `DOCTOR` $\rightarrow$ `/doctor/dashboard`

### Default Pilot Credentials (Initial Staging / Pilot)

| Role | Name | Email | Default Password | Department / Assignment |
| :--- | :--- | :--- | :--- | :--- |
| **Clinic Owner** | Dr. Patel | `admin@aarogyam.clinic` | `AarogyamAdmin@2026` | Administration & All Departments |
| **Receptionist** | Suresh Reddy | `reception@aarogyam.clinic` | `AarogyamStaff@2026` | Front Desk Operations |
| **Doctor (Gen)** | Dr. Ananya Sharma | `dr.sharma@aarogyam.clinic` | `AarogyamStaff@2026` | General Medicine (Room 101) |
| **Doctor (Ped)** | Dr. Rajesh Rao | `dr.rao@aarogyam.clinic` | `AarogyamStaff@2026` | Pediatrics (Room 102) |

> [!IMPORTANT]
> All staff should update their passwords upon first login via the Staff Profile / Password Reset interface.

---

## 3. Receptionist Desk SOP (Front Desk Operations)

### 3.1 Morning Clinic Setup
1. Log into `/staff/login` with receptionist credentials.
2. Verify Doctor Attendance: Check which doctors are on duty for the morning shift (09:00 - 13:00) or evening shift (16:30 - 20:00).
3. Ensure the Waiting Room Display TV is active at `http://<clinic-domain-or-ip>/waiting-room` in full-screen mode (`F11`).

### 3.2 In-Person Walk-In Patient Registration
When a walk-in patient arrives without an advance appointment:
1. Click **"Register Walk-In"** on the Receptionist Dashboard.
2. Enter the patient's phone number and search.
   - If returning: Select the patient from the existing family profile list.
   - If new: Enter full name, age, gender, and family relationship.
3. Select Department (General Medicine, Pediatrics, Orthopedics) and Doctor.
4. **₹0 Advance Deposit Disclosure:** Remind the patient that registration is free; consultation fees are settled post-consultation.
5. Click **"Issue Token"**.
6. The system issues a monotonic walk-in token (e.g., `W-101`). Click **"Print Token Slip"** to provide the patient with their physical slip containing:
   - Token Number
   - Department & Room
   - Live Queue Tracking QR Code / Link
   - Instructions to watch the waiting room screen.

### 3.3 Remote Appointment Review & Slot Allocation
When remote patient booking requests arrive in the **"Pending Allocation"** queue:
1. Open the appointment request details.
2. Review the patient's preferred time window.
3. Assign an available Doctor and confirm the exact time slot.
4. Click **"Allocate Slot"**.
5. **Atomic 5-Minute Hold:** The system locks that doctor slot for exactly 300 seconds (5 minutes) and notifies the patient via SMS to complete the ₹100 deposit via Razorpay.
6. Once payment is confirmed, the status automatically transitions to `CONFIRMED`.

### 3.4 Assisted On-Site Check-In
When an appointment patient arrives at the clinic:
1. Click **"Assisted Check-In"** on the dashboard.
2. Enter the patient's 6-character **Booking Reference** (e.g., `AAR-7890`) or mobile number.
3. Verify patient identity and confirm arrival.
4. Click **"Check-In & Issue Token"**. The appointment transitions to `CHECKED_IN`, enters the live doctor queue, and receives an appointment token (e.g., `A-102`).

### 3.5 Duplicate Candidate Handling
If a registering patient matches existing names or phone numbers:
- A **"Duplicate Candidate Warning"** modal appears.
- Carefully verify date of birth or family member details with the patient.
- **Never create duplicate records for the same individual.** Select the existing patient record to maintain lifelong visit history, or confirm "Register New Family Member" if it is a relative sharing the same mobile number.

---

## 4. Doctor Consultation Room SOP

### 4.1 Room Setup & Session Start
1. Log into `/staff/login` with your doctor credentials.
2. Confirm your active consultation room (e.g., Room 101).
3. The queue displays patients filtered for your room and department, ordered strictly by arrival and eligibility:
   - Scheduled appointments eligible near reserved times.
   - Walk-in patients in FIFO order.

### 4.2 Calling the Next Patient
1. Click **"Call Next Patient"**.
2. The patient at the top of the queue transitions to `IN_CONSULTATION`.
3. The Waiting Room Display TV flashes the token with high-contrast visual cues and sounds an audio announcement in the configured language:
   > *"Token A-101, please proceed to Room 101."*
4. **Clinical Safety Non-Interruptible Lock:** Once a patient is marked `IN_CONSULTATION`, the record is locked. No other staff member can alter or skip this patient.

### 4.3 Handling Absent / Delayed Patients (Skip & Recall)
If a patient does not appear after 3 announcements:
1. Click **"Skip Patient"**.
2. Select or enter the skip reason (`Patient not in waiting area`).
3. The token transitions to `SKIPPED`.
4. If the patient arrives later: Click **"Recall Patient"**. The patient is placed at the top of the eligible queue for the next call.

### 4.4 Completing the Consultation
1. When the consultation finishes, click **"Complete Consultation"**.
2. The token transitions to `COMPLETED`.
3. The system records the consultation duration to dynamically update the rolling average wait time estimate for remaining waiting patients.

---

## 5. Clinic Owner & Administrator SOP

### 5.1 Staff Account Management
The Clinic Owner has full administrative control over staff:
1. Navigate to `/owner/dashboard` $\rightarrow$ **"Manage Staff"**.
2. **Invite New Staff:**
   - Enter Name, Email, Phone, Role (`DOCTOR` or `RECEPTIONIST`), and Department.
   - Click **"Send Invitation"**.
   - The system generates a single-use SHA-256 activation token with a 48-hour expiry and sends an activation email.
3. **Deactivate Staff:** Immediately revokes session tokens and prevents login for departed staff.

### 5.2 Payment Reconciliation & Refund Policies
Under **"Payment & Reconciliation"**:
- **Standard Deposit:** ₹100 online booking hold deposit.
- **2-Hour Cancellation Policy:**
  - Cancelled $> 2$ hours before slot: Full ₹100 refund automatically initiated to original payment source.
  - Cancelled $\le 2$ hours before slot: Strictly ₹0 refund as per disclosed policy.
- **Late Payment Reconciliation (`RECONCILIATION_REQUIRED`):**
  - If a patient pays after the 5-minute hold expired and the slot was taken by another patient, the system flags the transaction as `RECONCILIATION_REQUIRED` to prevent double-booking.
  - Receptionist or Owner can click **"Manual Allocate Alternative Slot"** or **"Initiate Full Refund"**.

### 5.3 Immutable Audit Trail
All security-sensitive operations (owner bootstrap, staff invitation, role deactivation, queue overrides, payment refunds) are recorded in the permanent `AuditLog`. Inspect logs under `/owner/dashboard` $\rightarrow$ **"Audit Trail"**.

---

## 6. Waiting Room Display & Audio Announcements

- **Display URL:** `http://<clinic-domain-or-ip>/waiting-room`
- **Display Design:** High-contrast, WCAG 2.1 AA compliant.
- **Language Switcher:** Trilingual support with instant toggle between English, Hindi (`हिन्दी`), and Telugu (`తెలుగు`). Punjabi is strictly excluded.
- **Audio Announcements:** Toggle the audio icon on the top right. Uses native browser speech synthesis in the active language to announce tokens.
- **Screen Reader Support:** Includes `role="status"` and `aria-live="assertive"` regions for visually impaired patients.

---

## 7. Emergency & Business Continuity Procedures

| Scenario | Immediate Operational Action | Technical Fallback |
| :--- | :--- | :--- |
| **Temporary Internet Disconnection** | Continue front-desk queue management on local clinic LAN server. | Express server and local MongoDB continue operating without interruption. |
| **Power Outage** | Rely on clinic UPS/Inverter. When power restores, restart containers via `docker compose -f docker-compose.prod.yml up -d`. | State persists in Docker named volume `queueless-mongodb-data`. |
| **Emergency Patient Triage** | Receptionist clicks "Emergency Override" with physician approval. | Audit log records reason and staff ID. Emergency patient is placed at index 0. |
| **Thermal Printer Malfunction** | Send SMS token confirmation directly to patient's mobile number. | Patient can view real-time token tracking via `/queue/tracker`. |

---

**QueueLess Pilot Operations Approved by:**  
Dr. Patel, Medical Director & Clinic Owner, Aarogyam Community Clinic  
Engineering Lead, QueueLess Platform
