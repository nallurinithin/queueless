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
  PatientSession,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { paymentService } from '../src/services/paymentService.js';
import {
  getRazorpayConfig,
  validateRazorpayConfig,
  getPublicRazorpayConfig,
  RAZORPAY_MODES,
} from '../src/config/razorpay.js';

const TEST_SECRET = 'test_secret_key_aarogyam_123';
const TEST_WEBHOOK_SECRET = 'test_webhook_secret_aarogyam_456';

describe('Milestone 5: Payment Engine, Webhooks, Idempotency, and Refunds', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let staffToken;
  let patientToken;
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

    patientToken = crypto.randomBytes(32).toString('hex');
    const patientTokenHash = crypto.createHash('sha256').update(patientToken).digest('hex');
    await PatientSession.create({
      clinicId,
      bookingContactId: bookingContact._id,
      sessionTokenHash: patientTokenHash,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      absoluteExpiresAt: new Date(Date.now() + 30 * 86400000),
      lastActivityAt: new Date(),
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
      .set('Cookie', `queueless_patient_session=${patientToken}`)
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
      .set('Cookie', `queueless_patient_session=${patientToken}`)
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

  it('12. Environment Mode Separation: defaults to test mode when RAZORPAY_MODE is unset', () => {
    const defaultCfg = getRazorpayConfig({});
    expect(defaultCfg.mode).toBe('test');
    expect(defaultCfg.isLive).toBe(false);
    expect(defaultCfg.keyId).toBeDefined();
    expect(defaultCfg.keyId.startsWith('rzp_test_')).toBe(true);
  });

  it('13. Live Mode Activation: correctly activates live mode with valid live credentials', () => {
    const liveCfg = getRazorpayConfig({
      RAZORPAY_MODE: 'live',
      RAZORPAY_LIVE_KEY_ID: 'rzp_live_test_safe_id_999',
      RAZORPAY_LIVE_KEY_SECRET: 'live_secret_safe_val_888',
      RAZORPAY_LIVE_WEBHOOK_SECRET: 'live_webhook_safe_val_777',
    });

    expect(liveCfg.mode).toBe('live');
    expect(liveCfg.isLive).toBe(true);
    expect(liveCfg.keyId).toBe('rzp_live_test_safe_id_999');
    expect(liveCfg.keySecret).toBe('live_secret_safe_val_888');
    expect(liveCfg.webhookSecret).toBe('live_webhook_safe_val_777');
  });

  it('14. Credential Safety Guard: rejects mismatched or missing credentials in test and live modes', () => {
    // 1. Live mode with test key prefix must fail
    expect(() =>
      validateRazorpayConfig({
        mode: 'live',
        keyId: 'rzp_test_invalid_prefix',
        keySecret: 'secret_123',
        webhookSecret: 'wh_secret_123',
      })
    ).toThrow(/Test keys cannot be used in Live mode/i);

    // 2. Live mode missing live key secret must fail
    expect(() =>
      validateRazorpayConfig({
        mode: 'live',
        keyId: 'rzp_live_valid_key',
        keySecret: '',
        webhookSecret: 'wh_secret_123',
      })
    ).toThrow(/RAZORPAY_LIVE_KEY_SECRET is missing/i);

    // 3. Live mode missing webhook secret must fail
    expect(() =>
      validateRazorpayConfig({
        mode: 'live',
        keyId: 'rzp_live_valid_key',
        keySecret: 'secret_123',
        webhookSecret: '',
      })
    ).toThrow(/RAZORPAY_LIVE_WEBHOOK_SECRET is missing/i);

    // 4. Test mode with live key prefix must fail
    expect(() =>
      validateRazorpayConfig({
        mode: 'test',
        keyId: 'rzp_live_accidentally_in_test',
        keySecret: 'secret_123',
        webhookSecret: 'wh_secret_123',
      })
    ).toThrow(/Live credentials must NEVER be used in Test mode/i);
  });

  it('15. Public Configuration Safety: frontend receives only public keyId and mode, never secrets', () => {
    const publicConfig = getPublicRazorpayConfig();
    expect(publicConfig).toBeDefined();
    expect(publicConfig.mode).toBe('test');
    expect(publicConfig.keyId).toBeDefined();
    expect(publicConfig.keySecret).toBeUndefined();
    expect(publicConfig.webhookSecret).toBeUndefined();
  });

  it('16. Order Environment Isolation: blocks confirming or processing test orders when in live mode', async () => {
    // Create an order tagged with mode: 'test'
    const testOrder = await PaymentOrder.create({
      clinicId,
      appointmentId: heldAppointment._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_test_env_isolation_01',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.PENDING,
      mode: 'test',
    });

    // Temporarily simulate server operating in LIVE mode
    process.env.RAZORPAY_MODE = 'live';
    process.env.RAZORPAY_LIVE_KEY_ID = 'rzp_live_env_safe_check_01';
    process.env.RAZORPAY_LIVE_KEY_SECRET = 'live_secret_env_check_01';
    process.env.RAZORPAY_LIVE_WEBHOOK_SECRET = 'live_webhook_env_check_01';

    try {
      await expect(
        paymentService.confirmPaymentAndHold({
          orderId: testOrder.orderId,
          providerPaymentId: 'pay_test_001',
          providerSignature: 'sig_test_001',
        })
      ).rejects.toThrow(/Mode mismatch.*Never mix Test orders with Live payment verification/i);
    } finally {
      // Restore test environment
      delete process.env.RAZORPAY_MODE;
      delete process.env.RAZORPAY_LIVE_KEY_ID;
      delete process.env.RAZORPAY_LIVE_KEY_SECRET;
      delete process.env.RAZORPAY_LIVE_WEBHOOK_SECRET;
    }
  });

  it('17. Webhook Refund Processing: handles refund.processed webhook event and marks order refunded', async () => {
    const paidOrder = await PaymentOrder.create({
      clinicId,
      appointmentId: heldAppointment._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_refund_webhook_test_01',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_refund_hook_01',
      refundId: 'rfnd_hook_001',
    });

    const refundEventPayload = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_hook_001',
            payment_id: 'pay_refund_hook_01',
            amount: 10000,
            status: 'processed',
          },
        },
      },
    };

    const rawPayload = JSON.stringify(refundEventPayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const hookRes = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('x-razorpay-event-id', 'evt_refund_processed_999')
      .send(refundEventPayload)
      .expect(200);

    expect(hookRes.body.success).toBe(true);

    const updatedOrder = await PaymentOrder.findById(paidOrder._id);
    expect(updatedOrder.status).toBe(PAYMENT_STATUS.REFUNDED);
    expect(updatedOrder.refundCompletedAt).toBeDefined();
  });

  it('18. Out-of-Order Webhook: payment.failed arriving after order is already PAID does not overwrite PAID status', async () => {
    const paidOrder = await PaymentOrder.create({
      clinicId,
      appointmentId: heldAppointment._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_ooo_paid_protect_01',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_ooo_paid_01',
    });

    const failedPayload = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: 'pay_ooo_failed_01',
            order_id: paidOrder.orderId,
            status: 'failed',
          },
        },
      },
    };

    const rawPayload = JSON.stringify(failedPayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('x-razorpay-event-id', 'evt_ooo_failed_999')
      .send(failedPayload)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify order in DB was NOT changed to FAILED
    const orderInDb = await PaymentOrder.findById(paidOrder._id);
    expect(orderInDb.status).toBe(PAYMENT_STATUS.PAID);
  });

  it('19. Out-of-Order Webhook: payment.captured arriving after order is already REFUNDED does not resurrect PAID status', async () => {
    const refundedOrder = await PaymentOrder.create({
      clinicId,
      appointmentId: heldAppointment._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_ooo_refund_protect_01',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.REFUNDED,
      providerPaymentId: 'pay_ooo_refund_01',
      refundId: 'rfnd_ooo_01',
    });

    const capturePayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_ooo_refund_01',
            order_id: refundedOrder.orderId,
            status: 'captured',
          },
        },
      },
    };

    const rawPayload = JSON.stringify(capturePayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('x-razorpay-event-id', 'evt_ooo_capture_after_refund_999')
      .send(capturePayload)
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify order in DB was NOT changed to PAID
    const orderInDb = await PaymentOrder.findById(refundedOrder._id);
    expect(orderInDb.status).toBe(PAYMENT_STATUS.REFUNDED);
  });

  it('20. Webhook Refund Failure: handles refund.failed event and records failure reason in reconciliation notes', async () => {
    const orderWithRefund = await PaymentOrder.create({
      clinicId,
      appointmentId: heldAppointment._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_refund_fail_hook_01',
      amount: 10000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_rf_fail_01',
      refundId: 'rfnd_fail_hook_01',
    });

    const refundFailedPayload = {
      event: 'refund.failed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_fail_hook_01',
            payment_id: 'pay_rf_fail_01',
            amount: 10000,
            status: 'failed',
            error_description: 'Beneficiary bank account inactive or closed',
          },
        },
      },
    };

    const rawPayload = JSON.stringify(refundFailedPayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('x-razorpay-event-id', 'evt_refund_failed_999')
      .send(refundFailedPayload)
      .expect(200);

    expect(res.body.success).toBe(true);

    const orderInDb = await PaymentOrder.findById(orderWithRefund._id);
    expect(orderInDb.reconciliationNotes).toContain('Beneficiary bank account inactive or closed');
  });

  it('21. Webhook Signature Security: strictly rejects tampered payloads and forged signatures with HTTP 401', async () => {
    const payload = {
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_forged_01', order_id: 'order_forged_01' } } },
    };

    // Case A: Missing signature header
    await request(app)
      .post('/api/v1/payments/webhook')
      .send(payload)
      .expect(401);

    // Case B: Tampered signature header
    await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', '0000000000000000000000000000000000000000000000000000000000000000')
      .send(payload)
      .expect(401);
  });

  it('22. Unknown Webhook Events: acknowledges unknown event types cleanly without throwing error', async () => {
    const unknownPayload = {
      event: 'subscription.charged',
      payload: { subscription: { entity: { id: 'sub_random_123' } } },
    };

    const rawPayload = JSON.stringify(unknownPayload);
    const validSignature = crypto
      .createHmac('sha256', TEST_WEBHOOK_SECRET)
      .update(Buffer.from(rawPayload, 'utf8'))
      .digest('hex');

    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .set('x-razorpay-signature', validSignature)
      .set('x-razorpay-event-id', 'evt_unknown_type_999')
      .send(unknownPayload)
      .expect(200);

    expect(res.body.success).toBe(true);

    const recordedEvent = await PaymentWebhookEvent.findOne({ eventId: 'evt_unknown_type_999' });
    expect(recordedEvent).toBeDefined();
    expect(recordedEvent.eventType).toBe('subscription.charged');
    expect(recordedEvent.status).toBe('PROCESSED');
  });
});

