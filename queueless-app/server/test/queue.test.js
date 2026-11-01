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
  Appointment,
  QueueEntry,
  QueueSequenceCounter,
  QUEUE_STATUS,
  QUEUE_ENTRY_TYPE,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';

describe('Milestone 4: Queue Engine & Real-Time Flow Tests', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let staffToken;
  let testPatient;
  let testAppointment;

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
    await QueueEntry.deleteMany({});
    await QueueSequenceCounter.deleteMany({});

    // 1. Bootstrap clinic and owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

    // 2. Create Doctor
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

    // 3. Login as Staff
    const loginRes = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerPassword@123');
    staffToken = loginRes.sessionToken;

    // 4. Create base Contact and Patient
    const contact = await BookingContact.create({
      clinicId,
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      isVerified: true,
    });
    testPatient = await Patient.create({
      clinicId,
      fullName: 'Ramesh Kumar',
      gender: 'MALE',
      age: 38,
    });

    // 5. Create confirmed appointment for check-in
    testAppointment = await Appointment.create({
      clinicId,
      bookingReference: 'QL-CHK-001',
      publicReferenceHash: 'hash_chk_001',
      bookingContactId: contact._id,
      patientId: testPatient._id,
      departmentId,
      assignedDoctorId: doctorId,
      requestedWindow: {
        preferredDate: new Date().toISOString().split('T')[0],
        preferredTimeSlot: 'Morning',
      },
      allocatedSlot: {
        date: new Date().toISOString().split('T')[0],
        startTime: '10:00',
        endTime: '10:15',
      },
      status: 'CONFIRMED',
      depositRequired: 100,
      depositStatus: 'PAID',
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('1. Patient self-check-in with booking reference issues token and sets WAITING status', async () => {
    const res = await request(app)
      .post('/api/v1/queue/check-in')
      .send({ bookingReference: 'QL-CHK-001' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('GEN-01');
    expect(res.body.data.status).toBe(QUEUE_STATUS.WAITING);
    expect(res.body.alreadyCheckedIn).toBe(false);

    // Verify DB state
    const entry = await QueueEntry.findOne({ appointmentId: testAppointment._id });
    expect(entry).toBeDefined();
    expect(entry.publicToken).toBe('GEN-01');
    expect(entry.tokenSequence).toBe(1);
    expect(entry.entryType).toBe(QUEUE_ENTRY_TYPE.BOOKED);
  });

  it('2. Duplicate check-in is idempotent (returns existing token, does NOT create duplicate token)', async () => {
    const res = await request(app)
      .post('/api/v1/queue/check-in')
      .send({ bookingReference: 'QL-CHK-001' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.alreadyCheckedIn).toBe(true);
    expect(res.body.data.token).toBe('GEN-01');

    // Verify count in DB remains exactly 1
    const count = await QueueEntry.countDocuments({ appointmentId: testAppointment._id });
    expect(count).toBe(1);
  });

  it('3. Receptionist walk-in registration issues sequential FIFO token with ₹0 deposit', async () => {
    const res = await request(app)
      .post('/api/v1/staff/queue/walk-in')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        doctorId,
        departmentId,
        patientName: 'Sita Devi',
        gender: 'FEMALE',
        age: 45,
        phone: '9876543211',
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('GEN-02');
    expect(res.body.data.tokenSequence).toBe(2);
    expect(res.body.data.status).toBe(QUEUE_STATUS.WAITING);

    const savedEntry = await QueueEntry.findOne({ publicToken: 'GEN-02' });
    expect(savedEntry.entryType).toBe(QUEUE_ENTRY_TYPE.WALK_IN);
    expect(savedEntry.appointmentId).toBeNull();
  });

  it('4. Concurrency Test: 20 simultaneous walk-in registrations produce unique monotonic tokens without collision', async () => {
    const requests = Array.from({ length: 20 }).map((_, i) =>
      request(app)
        .post('/api/v1/staff/queue/walk-in')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          doctorId,
          departmentId,
          patientName: `Walkin Parallel ${i + 1}`,
          gender: 'OTHER',
          age: 30,
        })
    );

    const responses = await Promise.all(requests);
    const tokens = responses.map((r) => r.body.data.token);
    const sequences = responses.map((r) => r.body.data.tokenSequence);

    // All 20 must have succeeded
    expect(responses.every((r) => r.status === 201)).toBe(true);

    // All 20 tokens must be completely unique
    const uniqueTokens = new Set(tokens);
    expect(uniqueTokens.size).toBe(20);

    // Sequences must span exactly 3 to 22 without gaps
    const sortedSeqs = [...sequences].sort((a, b) => a - b);
    expect(sortedSeqs[0]).toBe(3);
    expect(sortedSeqs[19]).toBe(22);
  });

  it('5. callNext selects next eligible patient and transitions CALLED', async () => {
    const res = await request(app)
      .post('/api/v1/staff/queue/call-next')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ doctorId })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.hasWaitingPatients).toBe(true);
    expect(res.body.data.calledEntry.publicToken).toBe('GEN-01');
    expect(res.body.data.calledEntry.queueStatus).toBe(QUEUE_STATUS.CALLED);
    expect(res.body.data.calledEntry.callCount).toBe(1);
  });

  it('6. Clinical Safety Test: If doctor starts serving (CALLED -> SERVING), calling callNext again throws 409 Conflict', async () => {
    const entryA01 = await QueueEntry.findOne({ publicToken: 'GEN-01' });

    // Doctor starts serving GEN-01
    const serveRes = await request(app)
      .post(`/api/v1/staff/queue/${entryA01._id}/serve`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ doctorId })
      .expect(200);

    expect(serveRes.body.success).toBe(true);
    expect(serveRes.body.data.queueStatus).toBe(QUEUE_STATUS.SERVING);

    // Now try to callNext while consultation is in progress -> MUST throw 409 Conflict!
    const conflictRes = await request(app)
      .post('/api/v1/staff/queue/call-next')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ doctorId })
      .expect(409);

    expect(conflictRes.body.error).toContain('Consultations in progress cannot be interrupted');
  });

  it('7. Completing consultation transitions SERVING -> COMPLETED, freeing doctor for next call', async () => {
    const entryA01 = await QueueEntry.findOne({ publicToken: 'GEN-01' });

    const completeRes = await request(app)
      .post(`/api/v1/staff/queue/${entryA01._id}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ doctorId })
      .expect(200);

    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.data.queueStatus).toBe(QUEUE_STATUS.COMPLETED);

    // Now calling next patient succeeds because active consultation is finished
    const nextRes = await request(app)
      .post('/api/v1/staff/queue/call-next')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ doctorId })
      .expect(200);

    expect(nextRes.body.data.calledEntry.publicToken).toBe('GEN-02');
  });

  it('8. Skip patient transitions CALLED -> SKIPPED, and recall brings them back to CALLED', async () => {
    const entryA02 = await QueueEntry.findOne({ publicToken: 'GEN-02' });

    // Skip
    const skipRes = await request(app)
      .post(`/api/v1/staff/queue/${entryA02._id}/skip`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'Patient did not respond after 2 calls' })
      .expect(200);

    expect(skipRes.body.data.queueStatus).toBe(QUEUE_STATUS.SKIPPED);

    // Recall
    const recallRes = await request(app)
      .post(`/api/v1/staff/queue/${entryA02._id}/recall`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(recallRes.body.data.queueStatus).toBe(QUEUE_STATUS.CALLED);
    expect(recallRes.body.data.callCount).toBe(2);
  });

  it('9. Public display endpoint returns tokens and rooms only (zero patient names or phone numbers exposed)', async () => {
    const res = await request(app)
      .get('/api/v1/queue/display')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.nowServing).toBeDefined();
    expect(res.body.data.upNext).toBeDefined();

    const jsonString = JSON.stringify(res.body);

    // Invariant: ZERO patient names, phone numbers, or reasons exposed
    expect(jsonString).not.toContain('Ramesh Kumar');
    expect(jsonString).not.toContain('Sita Devi');
    expect(jsonString).not.toContain('9876543210');
    expect(jsonString).not.toContain('9876543211');

    // Only public tokens and room numbers
    expect(jsonString).toContain('GEN-02');
    expect(jsonString).toContain('101');
  });

  it('10. Live token tracking endpoint returns queue position and estimated wait time', async () => {
    const res = await request(app)
      .get('/api/v1/queue/track/GEN-05')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('GEN-05');
    expect(res.body.data.status).toBe(QUEUE_STATUS.WAITING);
    expect(res.body.data.patientsAhead).toBeGreaterThan(0);
    expect(res.body.data.estimatedWaitMins).toBeGreaterThan(0);
    expect(res.body.data.doctorName).toBe('Dr. Sharma');
    expect(res.body.data.roomNumber).toBe('101');
  });
});
