import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
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
  SlotHold,
  QueueEntry,
  QueueSequenceCounter,
  QUEUE_STATUS,
  QUEUE_ENTRY_TYPE,
  STAFF_ROLES,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';

describe('Phase 2 Concurrency & Database Integrity Audit & Fix Verification', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let receptionistToken;
  let doctorToken;
  let baseContact;
  let basePatient;

  beforeAll(async () => {
    await connectDB();
    await cleanupCollections();

    // 1. Bootstrap clinic and owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

    // 2. Create Doctor Staff & Doctor Profile
    const passwordHash = await bcrypt.hash('DoctorPassword@123', 10);
    const docStaff = await StaffUser.create({
      clinicId,
      name: 'Dr. Sharma',
      email: 'dr.sharma@aarogyam.clinic',
      passwordHash,
      role: STAFF_ROLES.DOCTOR,
      status: 'ACTIVE',
    });
    const doc = await Doctor.create({
      clinicId,
      staffUserId: docStaff._id,
      departmentIds: [departmentId],
      roomNumber: '101',
      active: true,
    });
    doctorId = doc._id;

    // 3. Create Receptionist Staff
    const recPasswordHash = await bcrypt.hash('ReceptionistPassword@123', 10);
    const recStaff = await StaffUser.create({
      clinicId,
      name: 'Rita Receptionist',
      email: 'receptionist@aarogyam.clinic',
      passwordHash: recPasswordHash,
      role: STAFF_ROLES.RECEPTIONIST,
      status: 'ACTIVE',
    });

    // 4. Generate Auth Tokens
    const ownerLogin = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerPassword@123');
    receptionistToken = ownerLogin.sessionToken;

    const docLogin = await staffAuthService.login('dr.sharma@aarogyam.clinic', 'DoctorPassword@123');
    doctorToken = docLogin.sessionToken;

    // 5. Create Base Contact & Patient
    baseContact = await BookingContact.create({
      clinicId,
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      isVerified: true,
    });
    basePatient = await Patient.create({
      clinicId,
      fullName: 'Integrity Test Patient',
      gender: 'MALE',
      age: 35,
    });

    // Ensure Mongoose synchronizes indexes (including our partial unique indexes)
    await QueueEntry.syncIndexes();
  });

  afterAll(async () => {
    await cleanupCollections();
    await disconnectDB();
  });

  async function cleanupCollections() {
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
    await SlotHold.deleteMany({});
    await QueueEntry.deleteMany({});
    await QueueSequenceCounter.deleteMany({});
  }

  // =========================================================================
  // TEST 1: 20 Repeated Trials of Simultaneous callNext with Multiple Waiting Patients
  // =========================================================================
  describe('Test 1: 20 Trials of Simultaneous Call-Next (Doctor Room Exclusivity)', () => {
    it('guarantees 100% mutual exclusion: exactly 1 request succeeds, 1 fails with 409, zero dual called patients', async () => {
      const today = new Date().toISOString().split('T')[0];
      const iterations = 20;
      let cleanMutualExclusionCount = 0;

      for (let i = 0; i < iterations; i++) {
        await QueueEntry.deleteMany({ clinicId, doctorId, queueDate: today });
        await QueueSequenceCounter.deleteMany({ clinicId, doctorId, queueDate: today });

        // Insert 2 waiting patients
        const p1 = await QueueEntry.create({
          clinicId,
          queueDate: today,
          departmentId,
          doctorId,
          patientId: basePatient._id,
          tokenSequence: 1,
          publicToken: `A-01-${i}`,
          entryType: QUEUE_ENTRY_TYPE.BOOKED,
          queueStatus: QUEUE_STATUS.WAITING,
          checkedInAt: new Date(Date.now() - 10000),
        });

        const p2 = await QueueEntry.create({
          clinicId,
          queueDate: today,
          departmentId,
          doctorId,
          patientId: basePatient._id,
          tokenSequence: 2,
          publicToken: `A-02-${i}`,
          entryType: QUEUE_ENTRY_TYPE.BOOKED,
          queueStatus: QUEUE_STATUS.WAITING,
          checkedInAt: new Date(Date.now() - 5000),
        });

        // Fire 2 simultaneous Call Next requests from receptionist and doctor
        const [res1, res2] = await Promise.all([
          request(app)
            .post('/api/v1/staff/queue/call-next')
            .set('Authorization', `Bearer ${receptionistToken}`)
            .send({ doctorId: doctorId.toString() }),
          request(app)
            .post('/api/v1/staff/queue/call-next')
            .set('Authorization', `Bearer ${doctorToken}`)
            .send({ doctorId: doctorId.toString() }),
        ]);

        const statuses = [res1.status, res2.status].sort();
        // One MUST succeed (200), and one MUST be rejected with conflict (409)
        expect(statuses).toEqual([200, 409]);

        // Inspect database state after race
        const calledEntries = await QueueEntry.find({
          clinicId,
          doctorId,
          queueDate: today,
          queueStatus: QUEUE_STATUS.CALLED,
        });

        const waitingEntries = await QueueEntry.find({
          clinicId,
          doctorId,
          queueDate: today,
          queueStatus: QUEUE_STATUS.WAITING,
        });

        // Strictly 1 CALLED, 1 WAITING in database
        expect(calledEntries.length).toBe(1);
        expect(waitingEntries.length).toBe(1);
        expect(calledEntries[0].callCount).toBe(1);

        cleanMutualExclusionCount++;
      }

      expect(cleanMutualExclusionCount).toBe(20);
    });
  });

  // =========================================================================
  // TEST 2: 20 Repeated Trials of Simultaneous Check-In for Same Appointment
  // =========================================================================
  describe('Test 2: 20 Trials of Simultaneous Check-In (Idempotent Check-In)', () => {
    it('guarantees exactly 1 QueueEntry and 1 token generated across all concurrent check-ins', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, queueDate: today });
      await QueueSequenceCounter.deleteMany({ clinicId, queueDate: today });
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const apt = await Appointment.create({
          clinicId,
          bookingReference: `QL-CHK-T2-${String(i).padStart(3, '0')}`,
          publicReferenceHash: `hash_t2_${i}`,
          patientId: basePatient._id,
          bookingContactId: baseContact._id,
          departmentId,
          assignedDoctorId: doctorId,
          requestedWindow: { preferredDate: today, preferredTimeSlot: 'Morning' },
          allocatedSlot: { date: today, startTime: '11:00', endTime: '11:15' },
          status: 'CONFIRMED',
        });

        const [res1, res2] = await Promise.all([
          request(app)
            .post('/api/v1/queue/check-in')
            .send({ bookingReference: apt.bookingReference }),
          request(app)
            .post('/api/v1/queue/check-in')
            .send({ bookingReference: apt.bookingReference }),
        ]);

        // Both requests must return HTTP 200
        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);

        // Both responses MUST reference the exact same public token and token sequence!
        expect(res1.body.data.token).toBe(res2.body.data.token);
        expect(res1.body.data.tokenSequence).toBe(res2.body.data.tokenSequence);

        // One must be the first check-in, and one must be flagged alreadyCheckedIn: true
        const alreadyCheckedInFlags = [res1.body.alreadyCheckedIn, res2.body.alreadyCheckedIn].sort();
        expect(alreadyCheckedInFlags).toEqual([false, true]);

        // Database verification: Exactly 1 QueueEntry document exists for this appointment
        const dbEntries = await QueueEntry.find({ appointmentId: apt._id });
        expect(dbEntries.length).toBe(1);
      }
    });
  });

  // =========================================================================
  // TEST 3: 20 Repeated Trials of Simultaneous startServing
  // =========================================================================
  describe('Test 3: 20 Trials of Simultaneous Start Serving (Exclusive Consultation)', () => {
    it('guarantees that simultaneous startServing calls on the same entry succeed idempotently without collision', async () => {
      const today = new Date().toISOString().split('T')[0];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        await QueueEntry.deleteMany({ clinicId, doctorId, queueDate: today });

        const calledPatient = await QueueEntry.create({
          clinicId,
          queueDate: today,
          departmentId,
          doctorId,
          patientId: basePatient._id,
          tokenSequence: 1,
          publicToken: `CALLED-T3-${i}`,
          entryType: QUEUE_ENTRY_TYPE.BOOKED,
          queueStatus: QUEUE_STATUS.CALLED,
          checkedInAt: new Date(Date.now() - 30000),
          calledAt: new Date(),
        });

        // Two staff members concurrently start consultation for the called patient
        const [r1, r2] = await Promise.all([
          request(app)
            .post(`/api/v1/staff/queue/${calledPatient._id}/serve`)
            .set('Authorization', `Bearer ${receptionistToken}`)
            .send({ doctorId: doctorId.toString() }),
          request(app)
            .post(`/api/v1/staff/queue/${calledPatient._id}/serve`)
            .set('Authorization', `Bearer ${doctorToken}`)
            .send({ doctorId: doctorId.toString() }),
        ]);

        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);

        // In DB, exactly 1 SERVING entry
        const servingEntries = await QueueEntry.find({
          clinicId,
          doctorId,
          queueDate: today,
          queueStatus: QUEUE_STATUS.SERVING,
        });
        expect(servingEntries.length).toBe(1);
        expect(servingEntries[0]._id.toString()).toBe(calledPatient._id.toString());
      }
    });
  });

  // =========================================================================
  // TEST 4: callNext while another patient is CALLED
  // =========================================================================
  describe('Test 4: callNext Rejected while another patient is CALLED', () => {
    it('strictly rejects callNext with HTTP 409 when a patient is already CALLED', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, doctorId, queueDate: today });

      const calledPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 1,
        publicToken: 'ACTIVE-CALL',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.CALLED,
        checkedInAt: new Date(Date.now() - 20000),
        calledAt: new Date(),
      });

      const waitingPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 2,
        publicToken: 'WAITING-02',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.WAITING,
        checkedInAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/staff/queue/call-next')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ doctorId: doctorId.toString() });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('has already been called');

      // Database verification: Called patient is still CALLED, waiting patient is still WAITING
      const checkCalled = await QueueEntry.findById(calledPatient._id);
      expect(checkCalled.queueStatus).toBe(QUEUE_STATUS.CALLED);

      const checkWaiting = await QueueEntry.findById(waitingPatient._id);
      expect(checkWaiting.queueStatus).toBe(QUEUE_STATUS.WAITING);
    });
  });

  // =========================================================================
  // TEST 5: callNext while another patient is SERVING
  // =========================================================================
  describe('Test 5: callNext Rejected while doctor is in SERVING state', () => {
    it('strictly rejects callNext with HTTP 409 when doctor is in consultation', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, doctorId, queueDate: today });

      const servingPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 1,
        publicToken: 'SERVING-01',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.SERVING,
        checkedInAt: new Date(Date.now() - 20000),
        servingAt: new Date(),
      });

      const waitingPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 2,
        publicToken: 'WAITING-02',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.WAITING,
        checkedInAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/staff/queue/call-next')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ doctorId: doctorId.toString() });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Consultations in progress cannot be interrupted');

      const checkServing = await QueueEntry.findById(servingPatient._id);
      expect(checkServing.queueStatus).toBe(QUEUE_STATUS.SERVING);

      const checkWaiting = await QueueEntry.findById(waitingPatient._id);
      expect(checkWaiting.queueStatus).toBe(QUEUE_STATUS.WAITING);
    });
  });

  // =========================================================================
  // TEST 6: Valid advancement after consultation completion
  // =========================================================================
  describe('Test 6: Consultation Completion Frees Room for Next Patient', () => {
    it('successfully allows callNext after the active consultation is completed', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, doctorId, queueDate: today });

      const servingPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 1,
        publicToken: 'SERVE-DONE',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.SERVING,
        checkedInAt: new Date(Date.now() - 30000),
        servingAt: new Date(Date.now() - 10000),
      });

      const waitingPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 2,
        publicToken: 'NEXT-IN-LINE',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.WAITING,
        checkedInAt: new Date(),
      });

      // 1. Complete consultation
      const completeRes = await request(app)
        .post(`/api/v1/staff/queue/${servingPatient._id}/complete`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ doctorId: doctorId.toString() });

      expect(completeRes.status).toBe(200);

      // 2. Call next patient - should now succeed!
      const callRes = await request(app)
        .post('/api/v1/staff/queue/call-next')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ doctorId: doctorId.toString() });

      expect(callRes.status).toBe(200);
      expect(callRes.body.data.calledEntry.publicToken).toBe('NEXT-IN-LINE');
      expect(callRes.body.data.calledEntry.queueStatus).toBe('CALLED');

      // Database verification
      const checkPrev = await QueueEntry.findById(servingPatient._id);
      expect(checkPrev.queueStatus).toBe(QUEUE_STATUS.COMPLETED);

      const checkNext = await QueueEntry.findById(waitingPatient._id);
      expect(checkNext.queueStatus).toBe(QUEUE_STATUS.CALLED);
    });
  });

  // =========================================================================
  // TEST 7: Valid advancement after a skipped patient is handled
  // =========================================================================
  describe('Test 7: Skipping Patient Frees Room for Next Patient', () => {
    it('successfully allows callNext after a no-show patient is skipped', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, doctorId, queueDate: today });

      const calledPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 1,
        publicToken: 'SKIP-ME',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.CALLED,
        checkedInAt: new Date(Date.now() - 30000),
        calledAt: new Date(Date.now() - 10000),
      });

      const waitingPatient = await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: basePatient._id,
        tokenSequence: 2,
        publicToken: 'TAKE-MY-TURN',
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.WAITING,
        checkedInAt: new Date(),
      });

      // 1. Skip patient
      const skipRes = await request(app)
        .post(`/api/v1/staff/queue/${calledPatient._id}/skip`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ reason: 'Patient not present in waiting area' });

      expect(skipRes.status).toBe(200);

      // 2. Call next patient - should now succeed!
      const callRes = await request(app)
        .post('/api/v1/staff/queue/call-next')
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({ doctorId: doctorId.toString() });

      expect(callRes.status).toBe(200);
      expect(callRes.body.data.calledEntry.publicToken).toBe('TAKE-MY-TURN');

      // Database verification
      const checkSkipped = await QueueEntry.findById(calledPatient._id);
      expect(checkSkipped.queueStatus).toBe(QUEUE_STATUS.SKIPPED);

      const checkNext = await QueueEntry.findById(waitingPatient._id);
      expect(checkNext.queueStatus).toBe(QUEUE_STATUS.CALLED);
    });
  });

  // =========================================================================
  // TEST 8: Duplicate check-in retries after a successful first request
  // =========================================================================
  describe('Test 8: Repeated Check-In Requests for Same Appointment', () => {
    it('returns the same token across 5 sequential retries without incrementing token sequence', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, queueDate: today });
      await QueueSequenceCounter.deleteMany({ clinicId, doctorId, queueDate: today });

      const apt = await Appointment.create({
        clinicId,
        bookingReference: 'QL-RETRY-001',
        publicReferenceHash: 'hash_retry_001',
        patientId: basePatient._id,
        bookingContactId: baseContact._id,
        departmentId,
        assignedDoctorId: doctorId,
        requestedWindow: { preferredDate: today, preferredTimeSlot: 'Morning' },
        allocatedSlot: { date: today, startTime: '12:00', endTime: '12:15' },
        status: 'CONFIRMED',
      });

      // First check-in
      const firstRes = await request(app)
        .post('/api/v1/queue/check-in')
        .send({ bookingReference: apt.bookingReference });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.alreadyCheckedIn).toBe(false);
      const originalToken = firstRes.body.data.token;
      const originalSequence = firstRes.body.data.tokenSequence;

      // 5 repeated subsequent check-ins
      for (let attempt = 1; attempt <= 5; attempt++) {
        const retryRes = await request(app)
          .post('/api/v1/queue/check-in')
          .send({ bookingReference: apt.bookingReference });

        expect(retryRes.status).toBe(200);
        expect(retryRes.body.alreadyCheckedIn).toBe(true);
        expect(retryRes.body.data.token).toBe(originalToken);
        expect(retryRes.body.data.tokenSequence).toBe(originalSequence);
      }

      // Check counter in DB - sequence counter must still be at originalSequence
      const counter = await QueueSequenceCounter.findOne({ clinicId, doctorId, queueDate: today });
      expect(counter.lastSequence).toBe(originalSequence);
    });
  });

  // =========================================================================
  // TEST 9: Database state after failed or interrupted operations
  // =========================================================================
  describe('Test 9: Database State After Failed Operations', () => {
    it('preserves clean database state without orphaned records on invalid actions', async () => {
      const today = new Date().toISOString().split('T')[0];

      // 1. Non-existent appointment check-in
      const fakeCheckIn = await request(app)
        .post('/api/v1/queue/check-in')
        .send({ bookingReference: 'QL-NONEXISTENT' });
      expect(fakeCheckIn.status).toBe(404);

      // 2. Cancelled appointment check-in rejected
      const cancelledApt = await Appointment.create({
        clinicId,
        bookingReference: 'QL-CANCELLED-001',
        publicReferenceHash: 'hash_canc_001',
        patientId: basePatient._id,
        bookingContactId: baseContact._id,
        departmentId,
        requestedWindow: { preferredDate: today, preferredTimeSlot: 'Morning' },
        status: 'CANCELLED',
      });
      const cancCheckIn = await request(app)
        .post('/api/v1/queue/check-in')
        .send({ bookingReference: cancelledApt.bookingReference });
      expect(cancCheckIn.status).toBe(400);

      // Verify no queue entries created for cancelled appointment
      const cancEntries = await QueueEntry.find({ appointmentId: cancelledApt._id });
      expect(cancEntries.length).toBe(0);

      // 3. Start serving non-existent entry rejected
      const fakeServe = await request(app)
        .post('/api/v1/staff/queue/6aedc575118a6502b569fce3/serve')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ doctorId: doctorId.toString() });
      expect(fakeServe.status).toBe(404);
    });
  });

  // =========================================================================
  // TEST 10: Adversarial Concurrency - 5 Trials of 50 Requests for Single Slot (250 Total)
  // =========================================================================
  describe('Test 10: 50 Concurrent Requests for Single Doctor Slot (Multi-Trial Re-Verification)', () => {
    it('executes 5 repeated trials of 50 concurrent requests (250 total): exactly 1 winner per trial, 49 conflicts, 0 duplicate holds', async () => {
      const trials = 5;

      for (let trial = 0; trial < trials; trial++) {
        const slotDate = `2026-12-${String(10 + trial).padStart(2, '0')}`;
        const startTime = '09:00';
        const endTime = '09:15';

        const aptDocs = [];
        for (let i = 0; i < 50; i++) {
          aptDocs.push({
            clinicId,
            bookingReference: `QL-T10-${trial}-${String(i).padStart(3, '0')}`,
            publicReferenceHash: `hash_t10_${trial}_${i}`,
            patientId: basePatient._id,
            bookingContactId: baseContact._id,
            departmentId,
            requestedWindow: { preferredDate: slotDate, preferredTimeSlot: 'Morning' },
            status: 'PENDING_REVIEW',
          });
        }
        const createdApts = await Appointment.insertMany(aptDocs);

        const promises = createdApts.map((apt) =>
          request(app)
            .post(`/api/v1/staff/appointments/${apt._id}/allocate`)
            .set('Authorization', `Bearer ${receptionistToken}`)
            .send({
              doctorId: doctorId.toString(),
              slotDate,
              startTime,
              endTime,
            })
        );

        const responses = await Promise.all(promises);
        const successes = responses.filter((r) => r.status === 200).length;
        const conflicts = responses.filter((r) => r.status === 409).length;

        const capacityKey = `${clinicId.toString()}_${doctorId.toString()}_${slotDate}_${startTime}`;
        const activeHolds = await SlotHold.find({ capacityKey, status: 'ACTIVE' });
        const heldApts = await Appointment.find({
          clinicId,
          assignedDoctorId: doctorId,
          'allocatedSlot.date': slotDate,
          'allocatedSlot.startTime': startTime,
          status: 'SLOT_HELD',
        });

        expect(successes).toBe(1);
        expect(conflicts).toBe(49);
        expect(activeHolds.length).toBe(1);
        expect(heldApts.length).toBe(1);
      }
    });
  });

  // =========================================================================
  // TEST 11: Crash Recovery - Interrupted Check-in Before QueueEntry Creation
  // =========================================================================
  describe('Test 11: Crash Recovery for Interrupted Check-In (Orphan CHECKED_IN Appointment)', () => {
    it('successfully recovers an appointment stuck in CHECKED_IN without a QueueEntry, generating exactly 1 token and 1 QueueEntry', async () => {
      const today = new Date().toISOString().split('T')[0];
      await QueueEntry.deleteMany({ clinicId, queueDate: today });
      await QueueSequenceCounter.deleteMany({ clinicId, doctorId, queueDate: today });

      // 1. Simulate crashed process: Appointment was claimed (CHECKED_IN), but process died before QueueEntry creation
      const crashedApt = await Appointment.create({
        clinicId,
        bookingReference: 'QL-CRASH-RECOVER-01',
        publicReferenceHash: 'hash_crash_001',
        patientId: basePatient._id,
        bookingContactId: baseContact._id,
        departmentId,
        assignedDoctorId: doctorId,
        requestedWindow: { preferredDate: today, preferredTimeSlot: 'Morning' },
        allocatedSlot: { date: today, startTime: '14:00', endTime: '14:15' },
        status: 'CHECKED_IN',
        checkInAt: new Date(Date.now() - 30000), // Checked in 30 seconds ago
        version: 1,
      });

      // Verify prerequisite: Appointment is CHECKED_IN, but NO QueueEntry exists
      const preCheck = await QueueEntry.findOne({ appointmentId: crashedApt._id });
      expect(preCheck).toBeNull();

      // 2. Patient retries check-in for the orphaned appointment
      const recoveryRes = await request(app)
        .post('/api/v1/queue/check-in')
        .send({ bookingReference: crashedApt.bookingReference });

      expect(recoveryRes.status).toBe(200);
      expect(recoveryRes.body.data.token).toBeDefined();
      const recoveredToken = recoveryRes.body.data.token;
      const recoveredSequence = recoveryRes.body.data.tokenSequence;

      // 3. Database verification: Exactly 1 QueueEntry was created
      const postEntries = await QueueEntry.find({ appointmentId: crashedApt._id });
      expect(postEntries.length).toBe(1);
      expect(postEntries[0].publicToken).toBe(recoveredToken);
      expect(postEntries[0].tokenSequence).toBe(recoveredSequence);
      expect(postEntries[0].queueStatus).toBe(QUEUE_STATUS.WAITING);

      // 4. Simultaneous retries on the recovered appointment: 5 concurrent requests
      const concurrentRetries = await Promise.all(
        Array.from({ length: 5 }).map(() =>
          request(app)
            .post('/api/v1/queue/check-in')
            .send({ bookingReference: crashedApt.bookingReference })
        )
      );

      for (const res of concurrentRetries) {
        expect(res.status).toBe(200);
        expect(res.body.alreadyCheckedIn).toBe(true);
        expect(res.body.data.token).toBe(recoveredToken);
        expect(res.body.data.tokenSequence).toBe(recoveredSequence);
      }

      // Final DB check: Still strictly 1 QueueEntry and sequence counter was incremented only once
      const finalEntries = await QueueEntry.find({ appointmentId: crashedApt._id });
      expect(finalEntries.length).toBe(1);

      const counter = await QueueSequenceCounter.findOne({ clinicId, doctorId, queueDate: today });
      expect(counter.lastSequence).toBe(recoveredSequence);
    });
  });
});
