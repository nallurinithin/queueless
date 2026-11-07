import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
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
  PaymentOrder,
  SlotHold,
  AuditLog,
  QueueEntry,
  QueueSequenceCounter,
  PatientSession,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  STAFF_ROLES,
  QUEUE_STATUS,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { appointmentService } from '../src/services/appointmentService.js';
import { paymentService } from '../src/services/paymentService.js';
import { queueService } from '../src/services/queueService.js';

describe('Phase 3 Final Correction: Owner Dashboard Deposit, Cancellation & Refund Policy Configuration', () => {
  let clinicId;
  let ownerToken;
  let receptionistToken;
  let doctorToken;
  let patientToken;
  let departmentId;
  let doctorId;
  let bookingContact;
  let patient;

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
    await PaymentOrder.deleteMany({});
    await SlotHold.deleteMany({});
    await AuditLog.deleteMany({});

    // 1. Bootstrap Owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Aarav Patel',
      ownerEmail: 'owner.policy@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    const ownerLogin = await staffAuthService.login('owner.policy@aarogyam.clinic', 'OwnerPassword@123');
    ownerToken = ownerLogin.sessionToken;

    // 2. Department
    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

    // 3. Receptionist User & Token
    const pwHash = await bcrypt.hash('StaffPassword@123', 10);
    await StaffUser.create({
      clinicId,
      name: 'Sunita Receptionist',
      email: 'sunita.policy@aarogyam.clinic',
      passwordHash: pwHash,
      role: STAFF_ROLES.RECEPTIONIST,
      status: 'ACTIVE',
    });
    const recepLogin = await staffAuthService.login('sunita.policy@aarogyam.clinic', 'StaffPassword@123');
    receptionistToken = recepLogin.sessionToken;

    // 4. Doctor User & Token
    const docStaff = await StaffUser.create({
      clinicId,
      name: 'Dr. Kavitha MD',
      email: 'dr.kavitha@aarogyam.clinic',
      passwordHash: pwHash,
      role: STAFF_ROLES.DOCTOR,
      status: 'ACTIVE',
      departmentIds: [departmentId],
    });
    const doc = await Doctor.create({
      clinicId,
      staffUserId: docStaff._id,
      departmentIds: [departmentId],
      roomNumber: 'Room 204',
      active: true,
    });
    doctorId = doc._id;
    const docLogin = await staffAuthService.login('dr.kavitha@aarogyam.clinic', 'StaffPassword@123');
    doctorToken = docLogin.sessionToken;

    // 5. Booking Contact and Patient
    bookingContact = await BookingContact.create({
      clinicId,
      phone: '9876500111',
      normalizedPhone: '+919876500111',
      isVerified: true,
    });
    patient = await Patient.create({
      clinicId,
      fullName: 'Ananya Sharma',
      gender: 'FEMALE',
      age: 29,
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
  });

  afterAll(async () => {
    await disconnectDB();
  });

  // =========================================================================
  // SECTION 1: DEPOSIT CONFIGURATION & RBAC
  // =========================================================================

  it('1. Owner can read current clinic deposit and cancellation policies', async () => {
    const res = await request(app)
      .get('/api/v1/clinic/policies')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.depositPolicy).toBeDefined();
    expect(res.body.data.depositPolicy.enabled).toBe(true);
    expect(res.body.data.depositPolicy.defaultAmount).toBe(100);
    expect(res.body.data.cancellationPolicy).toBeDefined();
    expect(res.body.data.cancellationPolicy.deadlineHours).toBe(2);
    expect(res.body.data.cancellationPolicy.refundPercentageBeforeDeadline).toBe(100);
    expect(res.body.data.cancellationPolicy.refundPercentageAfterDeadline).toBe(0);
    expect(res.body.data.cancellationPolicy.clinicCancellationRefundPercentage).toBe(100);
  });

  it('2. Owner can update deposit amount via PATCH /api/v1/clinic/policies', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        depositPolicy: {
          enabled: true,
          defaultAmount: 150,
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.depositPolicy.defaultAmount).toBe(150);

    const clinic = await Clinic.findById(clinicId);
    expect(clinic.depositPolicy.defaultAmount).toBe(150);

    // Verify audit log
    const audit = await AuditLog.findOne({ clinicId, action: 'CLINIC_POLICY_UPDATED' }).sort({ createdAt: -1 });
    expect(audit).toBeDefined();
    expect(audit.actorRole).toBe('CLINIC_OWNER');
    expect(audit.details.new.depositPolicy.defaultAmount).toBe(150);
  });

  it('3. Owner can disable advance deposits for online appointments', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        depositPolicy: {
          enabled: false,
          defaultAmount: 0,
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.depositPolicy.enabled).toBe(false);

    // Re-enable deposit for subsequent tests
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        depositPolicy: {
          enabled: true,
          defaultAmount: 120,
        },
      })
      .expect(200);
  });

  it('4. Receptionist CANNOT modify deposit or policy settings (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        depositPolicy: { defaultAmount: 50 },
      })
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Forbidden|access denied/i);
  });

  it('5. Doctor CANNOT modify deposit or policy settings (HTTP 403 Forbidden)', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        depositPolicy: { defaultAmount: 50 },
      })
      .expect(403);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Forbidden|access denied/i);
  });

  it('6. Patient or unauthenticated caller CANNOT modify policy settings (HTTP 401)', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .send({
        depositPolicy: { defaultAmount: 10 },
      })
      .expect(401);

    expect(res.body.success).toBe(false);
  });

  it('7. Patient cannot manipulate deposit amount through API requests (authoritative clinic configuration enforced)', async () => {
    // Set clinic deposit to ₹200
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ depositPolicy: { enabled: true, defaultAmount: 200 } })
      .expect(200);

    // Request new appointment
    const reqRes = await appointmentService.requestAppointment({
      clinicId,
      bookingContactId: bookingContact._id,
      patientTarget: 'SELF',
      newPatientData: { fullName: 'Ananya Sharma', gender: 'FEMALE', age: 29 },
      departmentId,
      requestedWindow: { preferredDate: '2026-11-20', preferredTimeSlot: 'Morning' },
    });

    // Allocate slot (5-min hold)
    const allocRes = await appointmentService.allocateSlotAtomic({
      appointmentId: reqRes._id,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      slotDate: '2026-11-20',
      startTime: '10:00',
      endTime: '10:15',
    });

    // Adversarial patient sends custom forged { amount: 1 } in request body
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .send({
        appointmentId: reqRes._id.toString(),
        amount: 1, // Tampered ₹1 attempt
        depositAmount: 1,
      })
      .expect(200);

    // Server must strictly bill the authoritative ₹200 (20000 paise), ignoring patient payload
    expect(orderRes.body.data.amount).toBe(20000);
    expect(orderRes.body.data.depositAmountRupees).toBe(200);
  });

  it('8. Different configured amounts produce the correct Razorpay order amount in paise', async () => {
    // Configure clinic deposit to ₹175
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ depositPolicy: { enabled: true, defaultAmount: 175 } })
      .expect(200);

    const appt = await appointmentService.requestAppointment({
      clinicId,
      bookingContactId: bookingContact._id,
      patientTarget: 'SELF',
      departmentId,
      requestedWindow: { preferredDate: '2026-11-21', preferredTimeSlot: 'Morning' },
    });

    await appointmentService.allocateSlotAtomic({
      appointmentId: appt._id,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      slotDate: '2026-11-21',
      startTime: '10:30',
      endTime: '10:45',
    });

    const res = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: appt._id.toString() })
      .expect(200);

    // ₹175.00 * 100 = 17500 paise
    expect(res.body.data.amount).toBe(17500);
    expect(res.body.data.depositAmountRupees).toBe(175);
  });

  it('9. Walk-in appointments never require an advance deposit (₹0 deposit)', async () => {
    const walkInRes = await queueService.registerWalkIn({
      clinicId,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      departmentId,
      patientName: 'Kamesh Walk-in',
      gender: 'MALE',
      age: 40,
    });

    expect(walkInRes.queueEntry).toBeDefined();
    expect(walkInRes.queueEntry.appointmentId).toBeNull();
    expect(walkInRes.queueEntry.queueStatus).toBe(QUEUE_STATUS.WAITING);

    // Walk-ins have no payment order, deposit is zero
    const count = await PaymentOrder.countDocuments({ patientId: walkInRes.patient._id });
    expect(count).toBe(0);
  });

  it('10. Disabling deposits follows defined no-deposit workflow without creating payment orders', async () => {
    // Disable advance deposit at clinic level
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ depositPolicy: { enabled: false, defaultAmount: 0 } })
      .expect(200);

    const appt = await appointmentService.requestAppointment({
      clinicId,
      bookingContactId: bookingContact._id,
      patientTarget: 'SELF',
      departmentId,
      requestedWindow: { preferredDate: '2026-11-22', preferredTimeSlot: 'Morning' },
    });

    expect(appt.depositRequired).toBe(false);
    expect(appt.paymentStatus).toBe(PAYMENT_STATUS.NOT_REQUIRED);

    // Allocating slot when deposits disabled confirms directly without a 5-minute hold
    const allocRes = await appointmentService.allocateSlotAtomic({
      appointmentId: appt._id,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      slotDate: '2026-11-22',
      startTime: '11:00',
      endTime: '11:15',
    });

    expect(allocRes.requiresDeposit).toBe(false);
    expect(allocRes.appointment.status).toBe(APPOINTMENT_STATUS.CONFIRMED);
    expect(allocRes.appointment.paymentStatus).toBe(PAYMENT_STATUS.NOT_REQUIRED);

    // Calling create-order on zero-deposit appointment returns paymentRequired: false
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: appt._id.toString() })
      .expect(200);

    expect(orderRes.body.data.paymentRequired).toBe(false);
    expect(orderRes.body.data.message).toContain('No advance deposit required');
  });

  // =========================================================================
  // SECTION 2: CANCELLATION & REFUND POLICY
  // =========================================================================

  it('11. Owner can update cancellation deadline hours', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cancellationPolicy: {
          deadlineHours: 3,
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.cancellationPolicy.deadlineHours).toBe(3);
  });

  it('12. Owner can configure refund percentages before and after deadline', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cancellationPolicy: {
          deadlineHours: 3,
          refundPercentageBeforeDeadline: 80,
          refundPercentageAfterDeadline: 20,
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.cancellationPolicy.refundPercentageBeforeDeadline).toBe(80);
    expect(res.body.data.cancellationPolicy.refundPercentageAfterDeadline).toBe(20);
    expect(res.body.data.cancellationPolicy.clinicCancellationRefundPercentage).toBe(100);
  });

  it('13. Rejects invalid refund percentages (<0, >100) or negative deadlines with HTTP 400', async () => {
    // Percentage > 100
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cancellationPolicy: { refundPercentageBeforeDeadline: 150 } })
      .expect(400);

    // Percentage < 0
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cancellationPolicy: { refundPercentageAfterDeadline: -10 } })
      .expect(400);

    // Negative deadline
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cancellationPolicy: { deadlineHours: -1 } })
      .expect(400);

    // Attempting to downgrade clinic cancellation refund from 100%
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cancellationPolicy: { clinicCancellationRefundPercentage: 50 } })
      .expect(400);
  });

  it('14. Cancellation before deadline uses configured refund percentage (e.g. 80%)', async () => {
    // 24 hours in future
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const appt = await Appointment.create({
      clinicId,
      bookingReference: 'QL-CONF-80',
      publicReferenceHash: 'hash_80',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: futureDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: futureDate, startTime: '11:00', endTime: '11:15' },
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositAmount: 200,
      paymentStatus: PAYMENT_STATUS.PAID,
      policySnapshot: {
        depositRequired: true,
        depositAmount: 200,
        cancellationDeadlineHours: 3,
        refundPercentageBeforeDeadline: 80,
        refundPercentageAfterDeadline: 20,
        clinicCancellationRefundPercentage: 100,
        capturedAt: new Date(),
      },
    });

    await PaymentOrder.create({
      clinicId,
      appointmentId: appt._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_test_80_refund',
      amount: 20000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_test_80',
    });

    const res = await request(app)
      .post('/api/v1/payments/cancel')
      .set('Cookie', `queueless_patient_session=${patientToken}`)
      .send({ appointmentId: appt._id.toString(), reason: 'Trip rescheduled' })
      .expect(200);

    // 80% of ₹200 = ₹160
    expect(res.body.success).toBe(true);
    expect(res.body.refundAmount).toBe(160);

    const orderInDb = await PaymentOrder.findOne({ orderId: 'order_test_80_refund' });
    expect(orderInDb.status).toBe(PAYMENT_STATUS.REFUNDED);
    expect(orderInDb.refundAmount).toBe(16000); // 16000 paise
  });

  it('15. Cancellation within deadline uses configured refund percentage (e.g. 20%)', async () => {
    // Slot 30 minutes in the future (within 3h deadline)
    const slotDate = new Date().toISOString().split('T')[0];
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const slotTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;

    const appt = await Appointment.create({
      clinicId,
      bookingReference: 'QL-CONF-20',
      publicReferenceHash: 'hash_20',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: slotDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: slotDate, startTime: slotTime, endTime: '12:00' },
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositAmount: 200,
      paymentStatus: PAYMENT_STATUS.PAID,
      policySnapshot: {
        depositRequired: true,
        depositAmount: 200,
        cancellationDeadlineHours: 3,
        refundPercentageBeforeDeadline: 80,
        refundPercentageAfterDeadline: 20,
        clinicCancellationRefundPercentage: 100,
        capturedAt: new Date(),
      },
    });

    await PaymentOrder.create({
      clinicId,
      appointmentId: appt._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_test_20_refund',
      amount: 20000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_test_20',
    });

    const res = await request(app)
      .post('/api/v1/payments/cancel')
      .set('Cookie', `queueless_patient_session=${patientToken}`)
      .send({ appointmentId: appt._id.toString(), reason: 'Late change' })
      .expect(200);

    // 20% of ₹200 = ₹40
    expect(res.body.success).toBe(true);
    expect(res.body.refundAmount).toBe(40);

    const orderInDb = await PaymentOrder.findOne({ orderId: 'order_test_20_refund' });
    expect(orderInDb.refundAmount).toBe(4000); // 4000 paise
  });

  it('16. Clinic cancellation ALWAYS produces a 100% full refund regardless of time or patient policy', async () => {
    // Slot in 10 minutes (would be within deadline for patient)
    const slotDate = new Date().toISOString().split('T')[0];
    const soon = new Date(Date.now() + 10 * 60 * 1000);
    const slotTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;

    const appt = await Appointment.create({
      clinicId,
      bookingReference: 'QL-CLINIC-CANCEL',
      publicReferenceHash: 'hash_clinic_cancel',
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: { preferredDate: slotDate, preferredTimeSlot: 'Morning' },
      allocatedSlot: { date: slotDate, startTime: slotTime, endTime: '12:00' },
      status: APPOINTMENT_STATUS.CONFIRMED,
      depositAmount: 200,
      paymentStatus: PAYMENT_STATUS.PAID,
      policySnapshot: {
        depositRequired: true,
        depositAmount: 200,
        cancellationDeadlineHours: 3,
        refundPercentageBeforeDeadline: 80,
        refundPercentageAfterDeadline: 0,
        clinicCancellationRefundPercentage: 100,
        capturedAt: new Date(),
      },
    });

    await PaymentOrder.create({
      clinicId,
      appointmentId: appt._id,
      bookingContactId: bookingContact._id,
      patientId: patient._id,
      orderId: 'order_test_clinic_100_refund',
      amount: 20000,
      currency: 'INR',
      status: PAYMENT_STATUS.PAID,
      providerPaymentId: 'pay_clinic_100',
    });

    // Cancelled by STAFF
    const res = await paymentService.cancelAppointmentWithPolicy({
      clinicId,
      appointmentId: appt._id,
      cancelledBy: 'STAFF',
      reason: 'Doctor emergency leave',
    });

    // Must be 100% full refund (₹200)
    expect(res.refundAmount).toBe(200);
    expect(res.policyOutcome).toBe('FULL_REFUND_CLINIC_INITIATED');
  });

  // =========================================================================
  // SECTION 3: HISTORICAL CONSISTENCY & IMMUTABILITY
  // =========================================================================

  it('17. Existing appointments retain their original deposit and policy snapshot when clinic settings change', async () => {
    // Day 1: Clinic settings: deposit ₹100, deadline 2h, 100%/0%
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        depositPolicy: { enabled: true, defaultAmount: 100 },
        cancellationPolicy: { deadlineHours: 2, refundPercentageBeforeDeadline: 100, refundPercentageAfterDeadline: 0 },
      })
      .expect(200);

    const apptDay1 = await appointmentService.requestAppointment({
      clinicId,
      bookingContactId: bookingContact._id,
      patientTarget: 'SELF',
      departmentId,
      requestedWindow: { preferredDate: '2026-11-25', preferredTimeSlot: 'Morning' },
    });

    expect(apptDay1.policySnapshot.depositAmount).toBe(100);
    expect(apptDay1.policySnapshot.cancellationDeadlineHours).toBe(2);

    // Day 2: Owner changes deposit to ₹250 and deadline to 5 hours
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        depositPolicy: { enabled: true, defaultAmount: 250 },
        cancellationPolicy: { deadlineHours: 5, refundPercentageBeforeDeadline: 70, refundPercentageAfterDeadline: 10 },
      })
      .expect(200);

    // Day 1 appointment MUST retain its original ₹100 obligation and 2h deadline
    const apptInDb = await Appointment.findById(apptDay1._id);
    expect(apptInDb.policySnapshot.depositAmount).toBe(100);
    expect(apptInDb.policySnapshot.cancellationDeadlineHours).toBe(2);
    expect(apptInDb.policySnapshot.refundPercentageBeforeDeadline).toBe(100);

    // Day 3: New appointment Day 2 uses the updated ₹250 and 5h deadline
    const apptDay2 = await appointmentService.requestAppointment({
      clinicId,
      bookingContactId: bookingContact._id,
      patientTarget: 'SELF',
      departmentId,
      requestedWindow: { preferredDate: '2026-11-26', preferredTimeSlot: 'Morning' },
    });

    expect(apptDay2.policySnapshot.depositAmount).toBe(250);
    expect(apptDay2.policySnapshot.cancellationDeadlineHours).toBe(5);
    expect(apptDay2.policySnapshot.refundPercentageBeforeDeadline).toBe(70);
  });

  it('18. Pending payment orders and active slot holds are NOT corrupted by clinic policy updates', async () => {
    // 1. Create appointment under ₹150 deposit
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ depositPolicy: { enabled: true, defaultAmount: 150 } })
      .expect(200);

    const appt = await appointmentService.requestAppointment({
      clinicId,
      bookingContactId: bookingContact._id,
      patientTarget: 'SELF',
      departmentId,
      requestedWindow: { preferredDate: '2026-11-27', preferredTimeSlot: 'Morning' },
    });

    await appointmentService.allocateSlotAtomic({
      appointmentId: appt._id,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      slotDate: '2026-11-27',
      startTime: '14:00',
      endTime: '14:15',
    });

    // Initialize payment order (15000 paise)
    const orderRes = await request(app)
      .post('/api/v1/payments/create-order')
      .send({ appointmentId: appt._id.toString() })
      .expect(200);

    const orderId = orderRes.body.data.orderId;

    // 2. Owner changes clinic deposit to ₹300 while payment is pending
    await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ depositPolicy: { enabled: true, defaultAmount: 300 } })
      .expect(200);

    // 3. The pending payment order MUST retain its original ₹150 (15000 paise)
    const orderInDb = await PaymentOrder.findOne({ orderId });
    expect(orderInDb.amount).toBe(15000);
    expect(orderInDb.status).toBe(PAYMENT_STATUS.PENDING);

    // The slot hold must remain active and intact
    const hold = await SlotHold.findOne({ appointmentId: appt._id });
    expect(hold).toBeDefined();
    expect(hold.status).toBe('ACTIVE');
  });

  // =========================================================================
  // SECTION 4: QUEUE ALGORITHM SYSTEM-MANAGED IMMUTABILITY
  // =========================================================================

  it('19. Queue algorithm configuration cannot be modified via clinic policy endpoints', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/policies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        queueAlgorithm: 'LIFO', // Disallowed arbitrary modification
        priorityWindowMins: 60,
      })
      .expect(200);

    // Ensure queue algorithm remains untouched and not exposed as editable owner settings
    const clinic = await Clinic.findById(clinicId);
    expect(clinic.toObject().queueAlgorithm).toBeUndefined();
  });

  it('20. Queue behavior remains strictly FIFO with single-patient doctor exclusivity', async () => {
    await QueueEntry.deleteMany({});
    await QueueSequenceCounter.deleteMany({});

    const queueDate = new Date().toISOString().split('T')[0];

    // Register two walk-in entries
    const w1 = await queueService.registerWalkIn({
      clinicId,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      departmentId,
      patientName: 'Queue Patient 1',
    });

    const w2 = await queueService.registerWalkIn({
      clinicId,
      receptionistUser: { _id: clinicId, role: 'RECEPTIONIST' },
      doctorId,
      departmentId,
      patientName: 'Queue Patient 2',
    });

    // First call must get w1 (FIFO)
    const call1 = await queueService.callNext({ clinicId, doctorId, queueDate, staffUser: { _id: clinicId, role: 'DOCTOR' } });
    expect(call1.calledEntry.publicToken).toBe(w1.queueEntry.publicToken);

    // Calling callNext again while doctor has active patient throws 409 Conflict
    await expect(
      queueService.callNext({ clinicId, doctorId, queueDate, staffUser: { _id: clinicId, role: 'DOCTOR' } })
    ).rejects.toThrow();
  });
});
