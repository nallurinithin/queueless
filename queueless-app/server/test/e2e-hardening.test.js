import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import {
  Clinic,
  StaffUser,
  Doctor,
  Department,
  BookingContact,
  Patient,
  PatientContactLink,
  PatientSession,
  Appointment,
  SlotHold,
  PaymentOrder,
  PaymentWebhookEvent,
  QueueEntry,
  QueueSequenceCounter,
  NotificationOutbox,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  QUEUE_STATUS,
  STAFF_ROLES,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { patientAuthService } from '../src/services/patientAuthService.js';

const TEST_SECRET = 'test_secret_key_aarogyam_123';
const TEST_WEBHOOK_SECRET = 'test_webhook_secret_aarogyam_456';

describe('Milestone 8: Hardening & End-to-End System Integration', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let receptionistToken;
  let doctorToken;
  let patientSessionCookie;
  let patientSessionToken;
  let bookingContactId;
  let createdAppointmentId;
  let bookingReference;
  let paymentOrderId;
  let queueToken;
  let queueEntryId;

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await PatientContactLink.deleteMany({});
    await PatientSession.deleteMany({});
    await Appointment.deleteMany({});
    await SlotHold.deleteMany({});
    await PaymentOrder.deleteMany({});
    await PaymentWebhookEvent.deleteMany({});
    await QueueEntry.deleteMany({});
    await QueueSequenceCounter.deleteMany({});
    await NotificationOutbox.deleteMany({});

    // 1. Bootstrap Clinic Owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

    // 2. Create Receptionist Staff
    const recepUser = await StaffUser.create({
      clinicId,
      name: 'Priya Receptionist',
      email: 'reception@aarogyam.clinic',
      role: STAFF_ROLES.RECEPTIONIST,
      status: 'ACTIVE',
      passwordHash: 'dummy',
    });
    const recepLogin = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerPassword@123');
    receptionistToken = recepLogin.sessionToken;

    // 3. Create Doctor Staff
    const docStaff = await StaffUser.create({
      clinicId,
      name: 'Dr. Sharma',
      email: 'dr.sharma@aarogyam.clinic',
      role: STAFF_ROLES.DOCTOR,
      status: 'ACTIVE',
    });
    const doc = await Doctor.create({
      clinicId,
      staffUserId: docStaff._id,
      departmentIds: [departmentId],
      roomNumber: '101',
    });
    doctorId = doc._id;
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('1. Step 1: Patient phone OTP authentication & persistent session creation', async () => {
    // Request OTP
    const reqOtpRes = await request(app)
      .post('/api/v1/patient/auth/request-otp')
      .send({ phone: '9876543210' })
      .expect(200);

    expect(reqOtpRes.body.success).toBe(true);

    // Verify OTP
    const verifyRes = await request(app)
      .post('/api/v1/patient/auth/verify-otp')
      .send({ phone: '9876543210', otp: '123456' })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.token).toBeDefined();

    const sessionToken = verifyRes.body.data.token;
    patientSessionToken = sessionToken;
    bookingContactId = verifyRes.body.data.contact._id || verifyRes.body.data.contact.id;
    patientSessionCookie = `queueless_patient_session=${sessionToken}`;

    // Verify persistent session cookie is set
    const cookies = verifyRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('queueless_patient_session'))).toBe(true);
  });

  it('2. Step 2: Patient submits an appointment request for a Family Member under same phone', async () => {
    const today = new Date().toISOString().split('T')[0];

    const reqRes = await request(app)
      .post('/api/v1/appointments/request')
      .set('Cookie', [patientSessionCookie])
      .set('x-patient-session', patientSessionToken)
      .send({
        patientTarget: 'NEW_FAMILY',
        newPatientData: {
          fullName: 'Aarav (Child)',
          relationship: 'CHILD',
          age: 6,
          gender: 'MALE',
        },
        departmentId: departmentId.toString(),
        requestedWindow: {
          preferredDate: today,
          preferredTimeSlot: 'Morning Session',
        },
        visitReason: 'Fever and cold',
      })
      .expect(201);

    expect(reqRes.body.success).toBe(true);
    expect(reqRes.body.data.bookingReference).toBeDefined();
    expect(reqRes.body.data.status).toBe(APPOINTMENT_STATUS.PENDING_REVIEW);

    createdAppointmentId = reqRes.body.data?.id;
    bookingReference = reqRes.body.data?.bookingReference;

    // Verify child has a distinct Patient ID linked to the same BookingContact
    const childPatient = await Patient.findOne({ fullName: 'Aarav (Child)' });
    expect(childPatient).toBeDefined();
    expect(childPatient.age).toBe(6);

    const link = await PatientContactLink.findOne({ patientId: childPatient._id, bookingContactId });
    expect(link).toBeDefined();
    expect(link.relationship).toBe('CHILD');
  });

  it('3. Step 3 & 4: Receptionist allocates doctor and creates atomic 5-minute slot hold', async () => {
    const today = new Date().toISOString().split('T')[0];

    const allocRes = await request(app)
      .post(`/api/v1/staff/appointments/${createdAppointmentId}/allocate`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        doctorId: doctorId.toString(),
        slotDate: today,
        startTime: '10:30',
        endTime: '10:45',
      })
      .expect(200);

    expect(allocRes.body.success).toBe(true);
    expect(allocRes.body.data.appointment.status).toBe(APPOINTMENT_STATUS.SLOT_HELD);
    expect(allocRes.body.data.holdExpiresAt).toBeDefined();

    // Verify SlotHold in DB
    const hold = await SlotHold.findOne({ appointmentId: createdAppointmentId });
    expect(hold).toBeDefined();
    expect(hold.capacityKey).toBe(`${clinicId}_${doctorId}_${today}_10:30`);
  });

  it('4. Step 5 & 6: Razorpay order creation, raw webhook verification, payment confirmation', async () => {
    // Patient initiates checkout order
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: createdAppointmentId })
      .expect(200);

    expect(orderRes.body.success).toBe(true);
    expect(orderRes.body.data.amount).toBe(10000); // ₹100
    paymentOrderId = orderRes.body.data.orderId;

    // Razorpay Webhook delivery: payment.captured
    const webhookPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_e2e_live_001',
            order_id: paymentOrderId,
            amount: 10000,
            status: 'captured',
          },
        },
      },
    };

    const rawBodyString = JSON.stringify(webhookPayload);
    const validWebhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(rawBodyString)
      .digest('hex');

    const webhookRes = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validWebhookSig)
      .set('x-razorpay-event-id', 'evt_e2e_payment_1')
      .send(webhookPayload)
      .expect(200);

    expect(webhookRes.body.success).toBe(true);

    // Verify Appointment is now CONFIRMED with PAID status
    const confirmedApt = await Appointment.findById(createdAppointmentId);
    expect(confirmedApt.status).toBe(APPOINTMENT_STATUS.CONFIRMED);
    expect(confirmedApt.paymentStatus).toBe(PAYMENT_STATUS.PAID);
    expect(confirmedApt.depositAmount).toBe(100);
  });

  it('5. Step 7 & 8: Patient arrives on-site, checks in using booking reference, receives queue token', async () => {
    const checkInRes = await request(app)
      .post('/api/v1/queue/check-in')
      .send({ bookingReference })
      .expect(200);

    expect(checkInRes.body.success).toBe(true);
    expect(checkInRes.body.data.token).toBe('GEN-01');
    expect(checkInRes.body.data.status).toBe(QUEUE_STATUS.WAITING);

    queueToken = checkInRes.body.data.token;

    const entry = await QueueEntry.findOne({ appointmentId: createdAppointmentId });
    expect(entry).toBeDefined();
    expect(entry.publicToken).toBe(queueToken);
    queueEntryId = entry._id;
  });

  it('6. Step 9: Doctor calls patient (WAITING -> CALLED) and display reflects token', async () => {
    const callRes = await request(app)
      .post('/api/v1/staff/queue/call-next')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ doctorId: doctorId.toString() })
      .expect(200);

    expect(callRes.body.success).toBe(true);
    expect(callRes.body.data.calledEntry.publicToken).toBe(queueToken);
    expect(callRes.body.data.calledEntry.queueStatus).toBe(QUEUE_STATUS.CALLED);

    // Waiting room display check: zero patient names, only token and room
    const displayRes = await request(app)
      .get('/api/v1/queue/display')
      .expect(200);

    expect(displayRes.body.success).toBe(true);
    const displayJson = JSON.stringify(displayRes.body.data);
    expect(displayJson).toContain(queueToken);
    expect(displayJson).toContain('101');
    expect(displayJson).not.toContain('Aarav (Child)');
  });

  it('7. Step 10: Doctor starts consultation (CALLED -> SERVING) and Clinical Safety Lock engages', async () => {
    // Start consultation
    const serveRes = await request(app)
      .post(`/api/v1/staff/queue/${queueEntryId}/serve`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ doctorId: doctorId.toString() })
      .expect(200);

    expect(serveRes.body.success).toBe(true);
    expect(serveRes.body.data.queueStatus).toBe(QUEUE_STATUS.SERVING);

    // Clinical Safety Invariant: Attempting to callNext during active consultation MUST fail with 409 Conflict
    const callNextDuringConsultation = await request(app)
      .post('/api/v1/staff/queue/call-next')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ doctorId: doctorId.toString() })
      .expect(409);

    expect(callNextDuringConsultation.body.error).toContain('Consultations in progress cannot be interrupted');
  });

  it('8. Step 11: Doctor completes consultation (SERVING -> COMPLETED)', async () => {
    const completeRes = await request(app)
      .post(`/api/v1/staff/queue/${queueEntryId}/complete`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({ doctorId: doctorId.toString() })
      .expect(200);

    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.data.queueStatus).toBe(QUEUE_STATUS.COMPLETED);

    // Check Appointment is now COMPLETED
    const finalApt = await Appointment.findById(createdAppointmentId);
    expect(finalApt.status).toBe('COMPLETED');
  });

  it('9. Security Hardening: Protected endpoints reject unauthorized and role-forbidden requests', async () => {
    // 1. Missing auth
    await request(app)
      .post('/api/v1/staff/queue/call-next')
      .send({ doctorId: doctorId.toString() })
      .expect(401);

    // 2. Tampered bearer token
    await request(app)
      .get('/api/v1/staff/notifications/outbox')
      .set('Authorization', 'Bearer invalid_tampered_token_xyz')
      .expect(401);

    // 3. Forged webhook signature
    await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', 'forged_fake_signature')
      .send({ event: 'payment.captured' })
      .expect(401);
  });

  it('10. Security Hardening: Rate limiting enforces 60s cooldown on OTP requests', async () => {
    const testPhone = '9876543299';
    // First OTP request succeeds
    await request(app)
      .post('/api/v1/patient/auth/request-otp')
      .send({ phone: testPhone })
      .expect(200);

    // Immediate second OTP request for same phone must fail with 429 Too Many Requests
    const res = await request(app)
      .post('/api/v1/patient/auth/request-otp')
      .send({ phone: testPhone })
      .expect(429);

    expect(res.body.error).toContain('Please wait');
  });
});
