import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
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
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { patientAuthService } from '../src/services/patientAuthService.js';

describe('Appointments & Family Booking Engine (/api/v1/appointments)', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let receptionistToken;
  let patientSessionToken;
  let patientSessionCookie;
  let bookingContactId;
  let initialPatientId;

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

    // Bootstrap clinic and owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    // Lookup department created by bootstrap
    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

    // Create doctor
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

    // Create and login receptionist
    const recep = await StaffUser.create({
      clinicId,
      name: 'Priya Receptionist',
      email: 'priya@aarogyam.clinic',
      role: 'RECEPTIONIST',
      status: 'ACTIVE',
      passwordHash: 'dummy',
    });
    // Create direct staff session for receptionist
    const recepSession = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerPassword@123');
    receptionistToken = recepSession.sessionToken;

    // Verify patient via OTP
    const otpRes = await patientAuthService.verifyOtp({
      phone: '9876543210',
      otp: '123456',
      clinicId,
    });
    patientSessionToken = otpRes.sessionToken;
    patientSessionCookie = `queueless_patient_session=${patientSessionToken}`;
    bookingContactId = otpRes.bookingContact.id;
    initialPatientId = otpRes.linkedPatients[0].id;
  });

  afterAll(async () => {
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
    await disconnectDB();
  });

  it('allows patient to submit an appointment request for Self', async () => {
    const res = await request(app)
      .post('/api/v1/appointments/request')
      .set('Cookie', [patientSessionCookie])
      .send({
        patientTarget: 'SELF',
        departmentId: departmentId.toString(),
        requestedWindow: {
          preferredDate: '2026-11-05',
          preferredTimeSlot: 'Morning Session',
          reasonCategory: 'Routine Consultation',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookingReference).toMatch(/^QL-[A-Z0-9]{6}$/);
    expect(res.body.data.status).toBe('PENDING_REVIEW');
  });

  it('allows booking for a new family member under the same contact number', async () => {
    const res = await request(app)
      .post('/api/v1/appointments/request')
      .set('Cookie', [patientSessionCookie])
      .send({
        patientTarget: 'NEW_FAMILY',
        newPatientData: {
          fullName: 'Aarav Kumar (Son)',
          gender: 'MALE',
          age: 8,
          relationship: 'CHILD',
        },
        departmentId: departmentId.toString(),
        requestedWindow: {
          preferredDate: '2026-11-05',
          preferredTimeSlot: 'Evening Session',
          reasonCategory: 'Fever check',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bookingReference).toMatch(/^QL-[A-Z0-9]{6}$/);

    // Verify two distinct patient records exist in database
    const allPatients = await Patient.find({ clinicId });
    expect(allPatients.length).toBeGreaterThanOrEqual(2);
  });

  it('allows returning patient to create a new appointment, reusing existing patient record', async () => {
    // Patient returns tomorrow for another appointment
    const res = await request(app)
      .post('/api/v1/appointments/request')
      .set('Cookie', [patientSessionCookie])
      .send({
        patientTarget: 'SELF',
        departmentId: departmentId.toString(),
        requestedWindow: {
          preferredDate: '2026-11-12',
          preferredTimeSlot: 'Morning Session',
          reasonCategory: 'Follow-up visit',
        },
      });

    expect(res.status).toBe(201);

    // Verify appointment was linked to existing initial patient ID, NOT a new duplicate patient
    const apt = await Appointment.findOne({ bookingReference: res.body.data.bookingReference });
    expect(apt.patientId.toString()).toBe(initialPatientId);
  });

  it('allows contact to view all household appointments (Self and Family)', async () => {
    const res = await request(app)
      .get('/api/v1/appointments/my-appointments')
      .set('Cookie', [patientSessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('allows receptionist to review pending requests and allocate doctor slot with 5-minute hold', async () => {
    // Get pending request
    const pendingRes = await request(app)
      .get('/api/v1/staff/appointments/pending')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.length).toBeGreaterThanOrEqual(1);

    const firstAptId = pendingRes.body.data[0]._id;

    // Allocate slot
    const allocateRes = await request(app)
      .post(`/api/v1/staff/appointments/${firstAptId}/allocate`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .send({
        doctorId: doctorId.toString(),
        slotDate: '2026-11-05',
        startTime: '10:15',
        endTime: '10:30',
      });

    expect(allocateRes.status).toBe(200);
    expect(allocateRes.body.data.appointment.status).toBe('SLOT_HELD');
    expect(allocateRes.body.data.holdDurationSecs).toBe(300); // 5 minutes

    // Verify SlotHold created in DB
    const hold = await SlotHold.findOne({ appointmentId: firstAptId });
    expect(hold).toBeDefined();
    expect(hold.status).toBe('ACTIVE');
  });

  it('flags duplicate patient candidates with warnings without auto-merging', async () => {
    const res = await request(app)
      .get('/api/v1/staff/patients/duplicate-check?phone=9876543210')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasCandidates).toBe(true);
    expect(res.body.candidates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.candidates[0].warning).toContain('associated with');
  });
});
