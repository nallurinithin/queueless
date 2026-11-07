/**
 * Phase 5 Comprehensive Security Audit & Authorization Verification Suite
 *
 * Validates:
 * 1. Authentication & Session Security (HttpOnly, SHA-256 hashing, session revocation, anti-enumeration)
 * 2. RBAC & Cross-Clinic Multi-Tenant Isolation (Receptionist, Doctor, Owner, Clinic A vs Clinic B)
 * 3. IDOR Prevention & Input Validation (Patient A vs Patient B, NoSQL query operators, malformed ObjectIds)
 * 4. Rate Limiting & Abuse Protection (OTP request limiters, staff login brute-force guards)
 * 5. Payment Security & Webhook Cryptographic Integrity (HMAC-SHA256, replay protection)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import {
  Clinic,
  StaffUser,
  StaffSession,
  Doctor,
  Department,
  BookingContact,
  Patient,
  Appointment,
  PatientSession,
  PaymentOrder,
  PaymentWebhookEvent,
  STAFF_ROLES,
  STAFF_STATUS,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { patientAuthService } from '../src/services/patientAuthService.js';
import { paymentService } from '../src/services/paymentService.js';
import { getRazorpayConfig } from '../src/config/razorpay.js';

describe('Phase 5 Security Audit & Application Hardening Verification', () => {
  let clinicA;
  let clinicB;
  let deptClinicA;
  let deptClinicB;
  let docClinicA;
  let docClinicB;

  // Staff Credentials & Tokens
  let ownerTokenClinicA;
  let receptionistTokenClinicA;
  let doctorTokenClinicA;
  let receptionistTokenClinicB;

  // Patients & Households
  let contactPatientA;
  let contactPatientB;
  let patientA;
  let patientB;
  let patientSessionTokenA;
  let patientSessionTokenB;

  // Appointments
  let appointmentA;
  let appointmentB;

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await StaffSession.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
    await PatientSession.deleteMany({});
    await PaymentOrder.deleteMany({});
    await PaymentWebhookEvent.deleteMany({});

    // 1. Setup Clinic A
    clinicA = await Clinic.create({
      name: 'Clinic A - Aarogyam Main',
      slug: 'clinic-a',
      address: { line1: 'Sector 10', city: 'Hyderabad', state: 'TS', pincode: '500001' },
      phone: '040-11111111',
      email: 'owner@clinic-a.com',
      isActive: true,
      depositPolicy: { enabled: true, defaultAmount: 100 },
      cancellationPolicy: { deadlineHours: 2, refundPercentageBeforeDeadline: 100, refundPercentageAfterDeadline: 0 },
    });

    // 2. Setup Clinic B (Multi-Tenant Target)
    clinicB = await Clinic.create({
      name: 'Clinic B - Aarogyam City',
      slug: 'clinic-b',
      address: { line1: 'Sector 20', city: 'Hyderabad', state: 'TS', pincode: '500002' },
      phone: '040-22222222',
      email: 'owner@clinic-b.com',
      isActive: true,
      depositPolicy: { enabled: true, defaultAmount: 150 },
      cancellationPolicy: { deadlineHours: 2, refundPercentageBeforeDeadline: 100, refundPercentageAfterDeadline: 0 },
    });

    deptClinicA = await Department.create({ clinicId: clinicA._id, name: 'General Medicine', code: 'GM-A', active: true });
    deptClinicB = await Department.create({ clinicId: clinicB._id, name: 'General Medicine', code: 'GM-B', active: true });

    const pwHash = await bcrypt.hash('SecurePassword@123', 10);

    // Staff Users for Clinic A
    const ownerA = await StaffUser.create({
      clinicId: clinicA._id,
      name: 'Dr. Nithin Owner',
      email: 'owner@clinic-a.com',
      passwordHash: pwHash,
      role: STAFF_ROLES.CLINIC_OWNER,
      status: STAFF_STATUS.ACTIVE,
    });
    const recepA = await StaffUser.create({
      clinicId: clinicA._id,
      name: 'Receptionist Snehith',
      email: 'recep@clinic-a.com',
      passwordHash: pwHash,
      role: STAFF_ROLES.RECEPTIONIST,
      status: STAFF_STATUS.ACTIVE,
    });
    const docStaffA = await StaffUser.create({
      clinicId: clinicA._id,
      name: 'Dr. Suresh MD',
      email: 'doctor@clinic-a.com',
      passwordHash: pwHash,
      role: STAFF_ROLES.DOCTOR,
      status: STAFF_STATUS.ACTIVE,
      departmentIds: [deptClinicA._id],
    });
    docClinicA = await Doctor.create({
      clinicId: clinicA._id,
      staffUserId: docStaffA._id,
      departmentIds: [deptClinicA._id],
      roomNumber: 'Room 101',
      active: true,
    });

    // Staff User for Clinic B
    const recepB = await StaffUser.create({
      clinicId: clinicB._id,
      name: 'Receptionist Clinic B',
      email: 'recep@clinic-b.com',
      passwordHash: pwHash,
      role: STAFF_ROLES.RECEPTIONIST,
      status: STAFF_STATUS.ACTIVE,
    });
    const docStaffB = await StaffUser.create({
      clinicId: clinicB._id,
      name: 'Dr. Clinic B MD',
      email: 'doctor@clinic-b.com',
      passwordHash: pwHash,
      role: STAFF_ROLES.DOCTOR,
      status: STAFF_STATUS.ACTIVE,
      departmentIds: [deptClinicB._id],
    });
    docClinicB = await Doctor.create({
      clinicId: clinicB._id,
      staffUserId: docStaffB._id,
      departmentIds: [deptClinicB._id],
      roomNumber: 'Room 201',
      active: true,
    });

    // Logins
    const loginOwnerA = await staffAuthService.login('owner@clinic-a.com', 'SecurePassword@123');
    ownerTokenClinicA = loginOwnerA.sessionToken;

    const loginRecepA = await staffAuthService.login('recep@clinic-a.com', 'SecurePassword@123');
    receptionistTokenClinicA = loginRecepA.sessionToken;

    const loginDocA = await staffAuthService.login('doctor@clinic-a.com', 'SecurePassword@123');
    doctorTokenClinicA = loginDocA.sessionToken;

    const loginRecepB = await staffAuthService.login('recep@clinic-b.com', 'SecurePassword@123');
    receptionistTokenClinicB = loginRecepB.sessionToken;

    // Patients
    contactPatientA = await BookingContact.create({
      clinicId: clinicA._id,
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      isVerified: true,
    });
    patientA = await Patient.create({
      clinicId: clinicA._id,
      fullName: 'Patient Alpha',
      gender: 'MALE',
      age: 30,
    });

    contactPatientB = await BookingContact.create({
      clinicId: clinicA._id,
      phone: '9876543222',
      normalizedPhone: '+919876543222',
      isVerified: true,
    });
    patientB = await Patient.create({
      clinicId: clinicA._id,
      fullName: 'Patient Beta (Victim)',
      gender: 'FEMALE',
      age: 28,
    });

    // Sessions for Patients
    patientSessionTokenA = crypto.randomBytes(32).toString('hex');
    await PatientSession.create({
      clinicId: clinicA._id,
      bookingContactId: contactPatientA._id,
      sessionTokenHash: crypto.createHash('sha256').update(patientSessionTokenA).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 86400000),
      lastActivityAt: new Date(),
    });

    patientSessionTokenB = crypto.randomBytes(32).toString('hex');
    await PatientSession.create({
      clinicId: clinicA._id,
      bookingContactId: contactPatientB._id,
      sessionTokenHash: crypto.createHash('sha256').update(patientSessionTokenB).digest('hex'),
      expiresAt: new Date(Date.now() + 7 * 86400000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 86400000),
      lastActivityAt: new Date(),
    });

    // Appointments
    appointmentA = await Appointment.create({
      clinicId: clinicA._id,
      bookingReference: 'QL-SEC-001',
      publicReferenceHash: 'hash_sec_001',
      bookingContactId: contactPatientA._id,
      patientId: patientA._id,
      departmentId: deptClinicA._id,
      assignedDoctorId: docClinicA._id,
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositAmount: 100,
      paymentStatus: PAYMENT_STATUS.PAID,
      allocatedSlot: { date: '2026-11-20', startTime: '10:00', endTime: '10:15' },
      requestedWindow: { preferredDate: '2026-11-20', preferredTimeSlot: 'MORNING' },
    });

    appointmentB = await Appointment.create({
      clinicId: clinicA._id,
      bookingReference: 'QL-SEC-002',
      publicReferenceHash: 'hash_sec_002',
      bookingContactId: contactPatientB._id,
      patientId: patientB._id,
      departmentId: deptClinicA._id,
      assignedDoctorId: docClinicA._id,
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositAmount: 100,
      paymentStatus: PAYMENT_STATUS.PAID,
      allocatedSlot: { date: '2026-11-20', startTime: '10:15', endTime: '10:30' },
      requestedWindow: { preferredDate: '2026-11-20', preferredTimeSlot: 'MORNING' },
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // =========================================================================
  // 1. AUTHENTICATION & SESSION SECURITY
  // =========================================================================
  describe('1. Authentication & Session Security', () => {
    it('rejects unauthenticated requests to protected staff endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/staff/appointments/doctors');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Authentication required');
    });

    it('rejects forged/invalid staff session tokens with 401', async () => {
      const fakeToken = crypto.randomBytes(32).toString('hex');
      const res = await request(app)
        .get('/api/v1/staff/appointments/doctors')
        .set('Cookie', `queueless_staff_session=${fakeToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid or expired staff session');
    });

    it('locks out OTP verification on the 4th consecutive failed attempt', async () => {
      const testPhone = '+919999900001';
      await patientAuthService.requestOtp({ phone: testPhone, clinicId: clinicA._id });

      // Attempts 1, 2, 3 should fail with 400
      for (let i = 1; i <= 3; i++) {
        const attempt = await request(app)
          .post('/api/v1/patient/auth/verify-otp')
          .send({ phone: testPhone, otp: '999999' });
        expect(attempt.status).toBe(400);
        expect(attempt.body.error).toContain('Invalid OTP');
      }

      // 4th attempt should lock out with 429 Too Many Requests
      const lockAttempt = await request(app)
        .post('/api/v1/patient/auth/verify-otp')
        .send({ phone: testPhone, otp: '999999' });
      expect(lockAttempt.status).toBe(429);
      expect(lockAttempt.body.error).toContain('Maximum verification attempts exceeded');
    });

    it('password reset invalidates all existing active staff sessions', async () => {
      // 1. Create staff user and session
      const pwHash = await bcrypt.hash('OldPassword@123', 10);
      const staff = await StaffUser.create({
        clinicId: clinicA._id,
        name: 'Reset Test User',
        email: 'reset.test@clinic-a.com',
        passwordHash: pwHash,
        role: STAFF_ROLES.RECEPTIONIST,
        status: STAFF_STATUS.ACTIVE,
      });

      const initialLogin = await staffAuthService.login('reset.test@clinic-a.com', 'OldPassword@123');
      const sessionBefore = initialLogin.sessionToken;

      // Verify session works
      const checkBefore = await request(app)
        .get('/api/v1/staff/appointments/doctors')
        .set('Cookie', `queueless_staff_session=${sessionBefore}`);
      expect(checkBefore.status).toBe(200);

      // 2. Request and complete password reset
      const resetReq = await staffAuthService.requestPasswordReset('reset.test@clinic-a.com');
      await staffAuthService.resetPassword({ token: resetReq.resetToken, newPassword: 'BrandNewPassword@456' });

      // 3. Old session must now be rejected with 401
      const checkAfter = await request(app)
        .get('/api/v1/staff/appointments/doctors')
        .set('Cookie', `queueless_staff_session=${sessionBefore}`);
      expect(checkAfter.status).toBe(401);
      expect(checkAfter.body.error).toContain('Invalid or expired staff session');
    });

    it('anti-enumeration: password reset for nonexistent email returns generic success', async () => {
      const res = await request(app)
        .post('/api/v1/staff/auth/forgot-password')
        .send({ email: 'ghost.user.doesnotexist@nowhere.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('If an active account exists');
    });
  });

  // =========================================================================
  // 2. ROLE-BASED ACCESS CONTROL (RBAC) & MULTI-CLINIC ISOLATION
  // =========================================================================
  describe('2. Role-Based Access Control (RBAC) & Multi-Clinic Isolation', () => {
    it('negative authorization: Receptionist CANNOT modify clinic deposit/cancellation policies (403)', async () => {
      const res = await request(app)
        .patch('/api/v1/clinic/policies')
        .set('Authorization', `Bearer ${receptionistTokenClinicA}`)
        .send({
          depositPolicy: { enabled: true, defaultAmount: 500 },
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Insufficient privileges');
    });

    it('negative authorization: Doctor CANNOT view payment reconciliation records (403)', async () => {
      const res = await request(app)
        .get('/api/v1/staff/payments/reconciliation')
        .set('Authorization', `Bearer ${doctorTokenClinicA}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('negative authorization: Doctor CANNOT invite or register new staff members (403)', async () => {
      const res = await request(app)
        .post('/api/v1/staff/invitations')
        .set('Authorization', `Bearer ${doctorTokenClinicA}`)
        .send({
          name: 'Hacked Staff',
          email: 'hacked@clinic-a.com',
          role: 'DOCTOR',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('cross-clinic isolation: Staff of Clinic B CANNOT allocate an appointment belonging to Clinic A (403)', async () => {
      // Create an appointment under Clinic A in PENDING_REVIEW
      const clinicAAppt = await Appointment.create({
        clinicId: clinicA._id,
        bookingReference: 'QL-ISOL-001',
        publicReferenceHash: 'hash_isol_001',
        bookingContactId: contactPatientA._id,
        patientId: patientA._id,
        departmentId: deptClinicA._id,
        status: APPOINTMENT_STATUS.PENDING_REVIEW,
        requestedWindow: { preferredDate: '2026-11-21', preferredTimeSlot: 'MORNING' },
      });

      // Staff of Clinic B attempts to allocate this appointment
      const res = await request(app)
        .post(`/api/v1/staff/appointments/${clinicAAppt._id}/allocate`)
        .set('Authorization', `Bearer ${receptionistTokenClinicB}`)
        .send({
          doctorId: docClinicB._id.toString(),
          slotDate: '2026-11-21',
          startTime: '09:00',
          endTime: '09:15',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('belonging to another clinic');
    });

    it('inactive staff member is immediately blocked on all endpoints (403)', async () => {
      const pwHash = await bcrypt.hash('DeactPassword@123', 10);
      const deactivatedUser = await StaffUser.create({
        clinicId: clinicA._id,
        name: 'Deactivated User',
        email: 'deact@clinic-a.com',
        passwordHash: pwHash,
        role: STAFF_ROLES.RECEPTIONIST,
        status: STAFF_STATUS.DEACTIVATED,
      });

      // Create session for deactivated user
      const rawToken = crypto.randomBytes(32).toString('hex');
      await StaffSession.create({
        clinicId: clinicA._id,
        staffUserId: deactivatedUser._id,
        sessionTokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 86400000),
      });

      const res = await request(app)
        .get('/api/v1/staff/appointments/doctors')
        .set('Authorization', `Bearer ${rawToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('inactive or has been deactivated');
    });
  });

  // =========================================================================
  // 3. IDOR PREVENTION & INPUT SANITIZATION
  // =========================================================================
  describe('3. IDOR Prevention & Input Sanitization', () => {
    it('IDOR: Patient A CANNOT cancel Patient B appointment via /appointments/:id/cancel (403)', async () => {
      // Patient A tries to cancel appointmentB belonging to Patient B
      const res = await request(app)
        .post(`/api/v1/appointments/${appointmentB._id}/cancel`)
        .set('Cookie', `queueless_patient_session=${patientSessionTokenA}`)
        .send({ reason: 'Malicious cancellation by another patient' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not authorized to cancel this appointment');

      // Verify Appointment B is still CONFIRMED in DB
      const apptInDb = await Appointment.findById(appointmentB._id);
      expect(apptInDb.status).toBe(APPOINTMENT_STATUS.CONFIRMED);
    });

    it('IDOR: Patient A CANNOT trigger refund/cancellation of Patient B appointment via /payments/cancel (403)', async () => {
      // Patient A tries to cancel appointmentB via payments/cancel
      const res = await request(app)
        .post('/api/v1/payments/cancel')
        .set('Cookie', `queueless_patient_session=${patientSessionTokenA}`)
        .send({ appointmentId: appointmentB._id.toString(), reason: 'Attempted deposit drain' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('not authorized to cancel this appointment');
    });

    it('unauthenticated request to /payments/cancel is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/v1/payments/cancel')
        .send({ appointmentId: appointmentB._id.toString(), reason: 'Anonymous cancellation' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('unauthenticated request to /notifications/process-outbox is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/process-outbox')
        .send({ batchSize: 10, forceFailure: true });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Valid worker secret or authorized staff session required');
    });

    it('NoSQL query operator injection in query string (?date[$ne]=null) is rejected with 400', async () => {
      const res = await request(app)
        .get('/api/v1/queue/display?date[$ne]=null');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Query operators are not permitted');
    });

    it('NoSQL query operator injection in request body ({ "$where": ... }) is rejected with 400', async () => {
      const res = await request(app)
        .post('/api/v1/patient/auth/request-otp')
        .send({ phone: { $ne: null } });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Query operators are not permitted');
    });

    it('malformed ObjectId returns 400 Bad Request, never 500 CastError crash', async () => {
      const res = await request(app)
        .post('/api/v1/appointments/not-a-valid-objectid/cancel')
        .set('Cookie', `queueless_patient_session=${patientSessionTokenA}`)
        .send({ reason: 'Testing malformed ID' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid identifier format');
    });
  });

  // =========================================================================
  // 4. RATE LIMITING & ABUSE PROTECTION
  // =========================================================================
  describe('4. Rate Limiting & Abuse Protection', () => {
    it('rate limiter triggers HTTP 429 when OTP request rate limit threshold is exceeded', async () => {
      const targetPhone = '+919876543299';

      // Send 3 requests under rate limit test header
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/patient/auth/request-otp')
          .set('x-test-rate-limit', 'true')
          .send({ phone: targetPhone });
      }

      // 4th request must be rejected with 429 RATE_LIMITED
      const blockedRes = await request(app)
        .post('/api/v1/patient/auth/request-otp')
        .set('x-test-rate-limit', 'true')
        .send({ phone: targetPhone });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toContain('Too many OTP requests');
    });

    it('rate limiter triggers HTTP 429 when staff login attempts exceed threshold', async () => {
      // Send 3 failed logins under rate limit test header
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/staff/auth/login')
          .set('x-test-rate-limit', 'true')
          .send({ email: 'owner@clinic-a.com', password: 'WrongPassword' });
      }

      // 4th request must be rejected with 429 RATE_LIMITED
      const blockedRes = await request(app)
        .post('/api/v1/staff/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: 'owner@clinic-a.com', password: 'WrongPassword' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.error).toContain('Too many staff login attempts');
    });
  });

  // =========================================================================
  // 5. PAYMENT SECURITY & WEBHOOK INTEGRITY
  // =========================================================================
  describe('5. Payment Security & Webhook Cryptographic Integrity', () => {
    it('webhook rejects tampered or missing HMAC signature with 401', async () => {
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_hack_123', order_id: 'order_hack_123', amount: 10000 } } },
      });

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'forged_invalid_hmac_hex_digest')
        .send(payload);

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid webhook signature');
    });

    it('webhook replay attack is idempotently rejected without double-processing', async () => {
      // Create active held appointment and order for webhook confirmation
      const replayAppt = await Appointment.create({
        clinicId: clinicA._id,
        bookingReference: 'QL-REPLAY-001',
        publicReferenceHash: 'hash_replay_001',
        bookingContactId: contactPatientA._id,
        patientId: patientA._id,
        departmentId: deptClinicA._id,
        status: APPOINTMENT_STATUS.SLOT_HELD,
        depositAmount: 100,
        paymentStatus: PAYMENT_STATUS.PENDING,
        slotHoldExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        requestedWindow: { preferredDate: '2026-11-20', preferredTimeSlot: 'MORNING' },
      });

      await PaymentOrder.create({
        clinicId: clinicA._id,
        appointmentId: replayAppt._id,
        bookingContactId: contactPatientA._id,
        patientId: patientA._id,
        orderId: 'order_replay_001',
        amount: 10000,
        currency: 'INR',
        status: PAYMENT_STATUS.CREATED,
      });

      const eventId = `evt_sec_test_${Date.now()}`;
      const payloadObj = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_replay_001',
              order_id: 'order_replay_001',
              amount: 10000,
            },
          },
        },
      };
      const rawBody = JSON.stringify(payloadObj);
      const secret = getRazorpayConfig().webhookSecret;
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      // First delivery
      const firstRes = await paymentService.processWebhook({
        rawBody,
        signature,
        eventId,
        eventPayload: payloadObj,
      });
      expect(firstRes.success).toBe(true);
      expect(firstRes.duplicate).toBe(false);

      // Replay delivery (same eventId)
      const replayRes = await paymentService.processWebhook({
        rawBody,
        signature,
        eventId,
        eventPayload: payloadObj,
      });
      expect(replayRes.success).toBe(true);
      expect(replayRes.duplicate).toBe(true);
      expect(replayRes.message).toContain('Webhook event already processed');
    });
  });
});
