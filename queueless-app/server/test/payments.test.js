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
  Appointment,
  PaymentOrder,
  PaymentWebhookEvent,
  SlotHold,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { paymentService } from '../src/services/paymentService.js';

const TEST_SECRET = 'test_secret_key_aarogyam_123';
const TEST_WEBHOOK_SECRET = 'test_webhook_secret_aarogyam_456';

describe('Milestone 5: Payment Engine, Webhooks, Idempotency, and Refunds', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let staffToken;
  let bookingContact;
  let patient;
  let heldAppointment;
  let expiredHoldAppointment;

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
    await PaymentOrder.deleteMany({});
    await PaymentWebhookEvent.deleteMany({});
    await SlotHold.deleteMany({});

    // 1. Bootstrap Clinic and Owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

    // 2. Doctor
    const docStaff = await StaffUser.create({
      clinicId,
      name: 'Dr. Sharma',
      email: 'dr.sharma@aarogyam.clinic',
      role: 'DOCTOR',
      status: 'ACTIVE',
    });
    const doc = await Doctor.create({
      clinicId,
      staffUserId: docStaff._id,
      departmentIds: [departmentId],
      roomNumber: '101',
    });
    doctorId = doc._id;

    // 3. Staff Token
    const loginRes = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerPassword@123');
    staffToken = loginRes.sessionToken;

    // 4. Contact and Patient
    bookingContact = await BookingContact.create({
      clinicId,
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      isVerified: true,
    });
    patient = await Patient.create({
      clinicId,
      fullName: 'Vikram Seth',
      gender: 'MALE',
      age: 42,
    });

    // 5. Active Held Appointment (expires in +5 minutes)
    const holdDate = new Date().toISOString().split('T')[0];
    heldAppointment = await Appointment.create({
      clinicId,
      bookingReference: 'QL-PAY-001',
      publicReferenceHash: 'hash_pay_001',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: holdDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: holdDate, startTime: '11:00', endTime: '11:15' },
      status: APPOINTMENT_STATUS.SLOT_HELD,
      slotHoldExpiresAt: new Date(Date.now() + 5 * 60 * 1000), // +5 mins
      depositRequired: 100,
      paymentStatus: PAYMENT_STATUS.PENDING,
    });

    // 6. Expired Hold Appointment (expired -5 minutes ago)
    expiredHoldAppointment = await Appointment.create({
      clinicId,
      bookingReference: 'QL-PAY-EXP',
      publicReferenceHash: 'hash_pay_exp',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: holdDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: holdDate, startTime: '11:30', endTime: '11:45' },
      status: APPOINTMENT_STATUS.SLOT_HELD,
      slotHoldExpiresAt: new Date(Date.now() - 5 * 60 * 1000), // -5 mins
      depositRequired: 100,
      paymentStatus: PAYMENT_STATUS.PENDING,
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('1. createPaymentOrder returns ₹100 (10000 paise) order details during active 5-minute hold', async () => {
    const res = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: heldAppointment._id.toString() })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.paymentRequired).toBe(true);
    expect(res.body.data.amount).toBe(10000); // ₹100.00
    expect(res.body.data.currency).toBe('INR');
    expect(res.body.data.orderId).toMatch(/^order_ql_/);

    // Verify DB
    const orderInDb = await PaymentOrder.findOne({ orderId: res.body.data.orderId });
    expect(orderInDb).toBeDefined();
    expect(orderInDb.status).toBe(PAYMENT_STATUS.PENDING);
    expect(orderInDb.amount).toBe(10000);
  });

  it('2. createPaymentOrder throws 400 if slot hold has expired', async () => {
    const res = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: expiredHoldAppointment._id.toString() })
      .expect(400);

    expect(res.body.error).toContain('Slot hold window has expired');
  });

  it('3. HMAC-SHA256 signature verification validates authentic signature and rejects forgery', async () => {
    const orderId = 'order_test_12345';
    const paymentId = 'pay_test_67890';

    // Authentic signature
    const validSignature = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = paymentService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature: validSignature,
      secret: TEST_SECRET,
    });
    expect(isValid).toBe(true);

    // Forged signature
    const isInvalid = paymentService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature: 'bad_signature_tampered_123',
      secret: TEST_SECRET,
    });
    expect(isInvalid).toBe(false);
  });

  it('4. Successful client callback verification confirms appointment and transitions paymentStatus to PAID', async () => {
    // Create fresh order
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: heldAppointment._id.toString() })
      .expect(200);

    const orderId = orderRes.body.data.orderId;
    const paymentId = 'pay_fake_client_callback_1';
    const validSignature = crypto
      .createHmac('sha256', TEST_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const verifyRes = await request(app)
      .post('/api/v1/payments/verify')
      .send({ orderId, paymentId, signature: validSignature })
      .expect(200);

    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.reconciliationRequired).toBe(false);

    // Verify DB appointment state
    const apt = await Appointment.findById(heldAppointment._id);
    expect(apt.status).toBe(APPOINTMENT_STATUS.CONFIRMED);
    expect(apt.paymentStatus).toBe(PAYMENT_STATUS.PAID);
    expect(apt.depositAmount).toBe(100);

    // Verify PaymentOrder state
    const order = await PaymentOrder.findOne({ orderId });
    expect(order.status).toBe(PAYMENT_STATUS.PAID);
    expect(order.providerPaymentId).toBe(paymentId);
  });

  it('5. Late payment after hold expired does NOT silently overbook; marks RECONCILIATION_REQUIRED and alerts staff', async () => {
    // Create an order on an appointment that was held but has now expired
    const lateAppointment = await Appointment.create({
      clinicId,
      bookingReference: 'QL-LATE-001',
      publicReferenceHash: 'hash_late_001',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: '2026-11-10', preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: '2026-11-10', startTime: '14:00', endTime: '14:15' },
      status: APPOINTMENT_STATUS.SLOT_HELD,
      slotHoldExpiresAt: new Date(Date.now() + 1000), // expires immediately
      depositRequired: 100,
      paymentStatus: PAYMENT_STATUS.PENDING,
    });

    const orderRes = await paymentService.createPaymentOrder({
      clinicId,
      appointmentId: lateAppointment._id,
      bookingContactId: bookingContact._id,
    });

    // Force hold to be expired
    lateAppointment.slotHoldExpiresAt = new Date(Date.now() - 60 * 1000);
    await lateAppointment.save();

    // Now payment confirms after hold expiration
    const result = await paymentService.confirmPaymentAndHold({
      orderId: orderRes.orderId,
      providerPaymentId: 'pay_late_after_expiry',
      providerSignature: 'sig_late',
    });

    expect(result.confirmed).toBe(false);
    expect(result.reconciliationRequired).toBe(true);

    // Check DB: Appointment must be HOLD_EXPIRED with RECONCILIATION_REQUIRED, never confirmed!
    const aptInDb = await Appointment.findById(lateAppointment._id);
    expect(aptInDb.status).toBe(APPOINTMENT_STATUS.HOLD_EXPIRED);
    expect(aptInDb.paymentStatus).toBe(PAYMENT_STATUS.RECONCILIATION_REQUIRED);

    // PaymentOrder must be marked RECONCILIATION_REQUIRED
    const orderInDb = await PaymentOrder.findOne({ orderId: orderRes.orderId });
    expect(orderInDb.status).toBe(PAYMENT_STATUS.RECONCILIATION_REQUIRED);
  });

  it('6. Webhook rejects invalid signature with 401', async () => {
    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_123', order_id: 'order_123' } } },
    };

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', 'invalid_signature_hex')
      .set('x-razorpay-event-id', 'evt_bad_sig')
      .send(payload)
      .expect(401);

    expect(res.body.error).toContain('Invalid webhook signature');
  });

  it('7. Webhook processes payment.captured and updates appointment', async () => {
    // Create new appointment in SLOT_HELD
    const webhookApt = await Appointment.create({
      clinicId,
      bookingReference: 'QL-WH-001',
      publicReferenceHash: 'hash_wh_001',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: '2026-11-12', preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: '2026-11-12', startTime: '15:00', endTime: '15:15' },
      status: APPOINTMENT_STATUS.SLOT_HELD,
      slotHoldExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      depositRequired: 100,
      paymentStatus: PAYMENT_STATUS.PENDING,
    });

    const orderRes = await paymentService.createPaymentOrder({
      clinicId,
      appointmentId: webhookApt._id,
      bookingContactId: bookingContact._id,
    });

    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_wh_captured_01',
            order_id: orderRes.orderId,
            amount: 10000,
            status: 'captured',
          },
        },
      },
    };

    const rawBodyString = JSON.stringify(payload);
    const validWebhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(rawBodyString)
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validWebhookSig)
      .set('x-razorpay-event-id', 'evt_unique_101')
      .send(payload)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.duplicate).toBe(false);

    // Verify DB
    const confirmedApt = await Appointment.findById(webhookApt._id);
    expect(confirmedApt.status).toBe(APPOINTMENT_STATUS.CONFIRMED);
    expect(confirmedApt.paymentStatus).toBe(PAYMENT_STATUS.PAID);
  });

  it('8. Webhook Idempotency: duplicate delivery of identical event ID is acknowledged without re-processing', async () => {
    const payload = {
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_fail_01', order_id: 'order_dummy_fail' } } },
    };

    const rawBodyString = JSON.stringify(payload);
    const validWebhookSig = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(rawBodyString)
      .digest('hex');

    // First delivery
    const res1 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validWebhookSig)
      .set('x-razorpay-event-id', 'evt_idempotency_duplicate_999')
      .send(payload)
      .expect(200);

    expect(res1.body.duplicate).toBe(false);

    // Second delivery of IDENTICAL event ID
    const res2 = await request(app)
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', validWebhookSig)
      .set('x-razorpay-event-id', 'evt_idempotency_duplicate_999')
      .send(payload)
      .expect(200);

    expect(res2.body.duplicate).toBe(true);
    expect(res2.body.message).toContain('already processed');

    // Exactly 1 webhook event record in DB
    const count = await PaymentWebhookEvent.countDocuments({ eventId: 'evt_idempotency_duplicate_999' });
    expect(count).toBe(1);
  });

  it('9. Cancellation > 2 hours prior to slot issues 100% full refund (₹100) and releases capacity', async () => {
    // Appointment 24 hours in the future
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const refundableApt = await Appointment.create({
      clinicId,
      bookingReference: 'QL-REF-FULL',
      publicReferenceHash: 'hash_ref_full',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: futureDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: futureDate, startTime: '10:00', endTime: '10:15' },
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositRequired: 100,
      depositAmount: 100,
      paymentStatus: PAYMENT_STATUS.PAID,
    });

    await PaymentOrder.create({
      clinicId,
      appointmentId: refundableApt._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_ref_full_1',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_full_ref_01',
    });

    const res = await request(app)
      .post('/api/v1/payments/cancel')
      .send({ appointmentId: refundableApt._id.toString(), reason: 'Patient plans changed' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.refundAmount).toBe(100);
    expect(res.body.policyOutcome).toBe('FULL_REFUND_PRIOR_TO_2_HOURS');

    // Check DB
    const aptInDb = await Appointment.findById(refundableApt._id);
    expect(aptInDb.status).toBe(APPOINTMENT_STATUS.CANCELLED);
    expect(aptInDb.paymentStatus).toBe(PAYMENT_STATUS.REFUNDED);

    const orderInDb = await PaymentOrder.findOne({ orderId: 'order_ref_full_1' });
    expect(orderInDb.status).toBe(PAYMENT_STATUS.REFUNDED);
    expect(orderInDb.refundAmount).toBe(10000);
  });

  it('10. Cancellation <= 2 hours prior strictly enforces ₹0 refund per disclosed policy', async () => {
    // Appointment 30 minutes in the future (within 2 hours)
    const slotDate = new Date().toISOString().split('T')[0];
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const slotTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;

    const nonRefundableApt = await Appointment.create({
      clinicId,
      bookingReference: 'QL-NO-REF',
      publicReferenceHash: 'hash_no_ref',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: slotDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: slotDate, startTime: slotTime, endTime: '12:00' },
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositRequired: 100,
      depositAmount: 100,
      paymentStatus: PAYMENT_STATUS.PAID,
    });

    await PaymentOrder.create({
      clinicId,
      appointmentId: nonRefundableApt._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_no_ref_1',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_no_ref_01',
    });

    const res = await request(app)
      .post('/api/v1/payments/cancel')
      .send({ appointmentId: nonRefundableApt._id.toString(), reason: 'Last minute cancellation' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.refundAmount).toBe(0);
    expect(res.body.policyOutcome).toBe('NO_REFUND_WITHIN_2_HOURS');

    // Check DB: Appointment cancelled, but payment is NOT refunded
    const aptInDb = await Appointment.findById(nonRefundableApt._id);
    expect(aptInDb.status).toBe(APPOINTMENT_STATUS.CANCELLED);
    expect(aptInDb.paymentStatus).toBe(PAYMENT_STATUS.PAID); // Retained, no refund

    const orderInDb = await PaymentOrder.findOne({ orderId: 'order_no_ref_1' });
    expect(orderInDb.status).toBe(PAYMENT_STATUS.PAID);
  });

  it('11. Staff Reconciliation: staff can view reconciliation items and resolve them via refund or manual confirm', async () => {
    // List reconciliation items
    const listRes = await request(app)
      .get('/api/v1/staff/payments/reconciliation')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.length).toBeGreaterThan(0);

    const reconItem = listRes.body.data[0];

    // Staff resolves item by issuing refund
    const resolveRes = await request(app)
      .post(`/api/v1/staff/payments/${reconItem._id}/reconcile`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ action: 'REFUND', notes: 'Patient arrived late, slot unavailable, refunded' })
      .expect(200);

    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.data.status).toBe(PAYMENT_STATUS.REFUNDED);
  });
});

