import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import {
  Clinic,
  StaffUser,
  Doctor,
  Department,
  Patient,
  QueueEntry,
  NotificationOutbox,
  OUTBOX_STATUS,
  QUEUE_STATUS,
  QUEUE_ENTRY_TYPE,
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';
import { notificationOutboxService } from '../src/services/notificationOutboxService.js';
import { estimateService } from '../src/services/estimateService.js';

describe('Milestone 6: Notifications, Outbox Engine & Wait Estimates', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let staffToken;
  let testPatient;
  let testQueueEntries = [];

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await Patient.deleteMany({});
    await QueueEntry.deleteMany({});
    await NotificationOutbox.deleteMany({});

    // 1. Bootstrap
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

    // 4. Base Patient
    testPatient = await Patient.create({
      clinicId,
      fullName: 'Aarav Sharma',
      gender: 'MALE',
      age: 29,
    });
  });

  afterAll(async () => {
    await disconnectDB();
  });

  it('1. Outbox Pattern: Enqueuing creates record in PENDING state with 0 attempts', async () => {
    const res = await notificationOutboxService.enqueue({
      clinicId,
      recipient: '+919876543210',
      recipientType: 'PATIENT',
      channel: 'SMS',
      eventType: 'appointment.confirmed',
      title: 'Appointment Confirmed',
      message: 'Your appointment at Aarogyam Community Clinic is confirmed.',
      payload: { bookingRef: 'QL-CONF-101' },
    });

    expect(res.enqueued).toBe(true);
    expect(res.record.status).toBe(OUTBOX_STATUS.PENDING);
    expect(res.record.attempts).toBe(0);
    expect(res.record.recipient).toBe('+919876543210');

    // DB verify
    const inDb = await NotificationOutbox.findById(res.record._id);
    expect(inDb).toBeDefined();
    expect(inDb.status).toBe(OUTBOX_STATUS.PENDING);
  });

  it('2. Worker loop delivers pending notification and transitions status to DELIVERED', async () => {
    const processRes = await request(app)
      .post('/api/v1/notifications/process-outbox')
      .set('x-worker-secret', 'queueless_worker_secret')
      .send({ batchSize: 5 })
      .expect(200);

    expect(processRes.body.success).toBe(true);
    expect(processRes.body.data.delivered).toBeGreaterThan(0);

    const deliveredItems = await NotificationOutbox.find({ status: OUTBOX_STATUS.DELIVERED });
    expect(deliveredItems.length).toBeGreaterThan(0);
    expect(deliveredItems[0].deliveredAt).toBeDefined();
    expect(deliveredItems[0].attempts).toBe(1);
  });

  it('3. Retry with Exponential Backoff: Transient failure marks FAILED and schedules nextRetryAt', async () => {
    // Enqueue an item
    const enq = await notificationOutboxService.enqueue({
      clinicId,
      recipient: '+919876543211',
      recipientType: 'PATIENT',
      channel: 'SMS',
      eventType: 'queue.token_called',
      message: 'Token GEN-01 called to Room 101.',
    });

    // Process with simulated carrier failure
    const processRes = await request(app)
      .post('/api/v1/notifications/process-outbox')
      .set('x-worker-secret', 'queueless_worker_secret')
      .send({ batchSize: 5, forceFailure: true })
      .expect(200);

    expect(processRes.body.data.failed).toBeGreaterThan(0);

    const failedItem = await NotificationOutbox.findById(enq.record._id);
    expect(failedItem.status).toBe(OUTBOX_STATUS.FAILED);
    expect(failedItem.attempts).toBe(1);
    expect(failedItem.lastError).toContain('Carrier upstream gateway error');
    expect(failedItem.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('4. Dead Letter Handling: Exhausting maximum attempts (3) transitions message to DEAD_LETTER', async () => {
    // Force item to attempts=2 and nextRetryAt in past
    const deadItem = await NotificationOutbox.create({
      clinicId,
      recipient: '+919876543212',
      eventType: 'test.deadletter',
      message: 'Critical notification',
      status: OUTBOX_STATUS.FAILED,
      attempts: 2,
      maxAttempts: 3,
      nextRetryAt: new Date(Date.now() - 1000), // eligible for retry now
    });

    // Process with failure (3rd attempt)
    await notificationOutboxService.processOutbox({ clinicId, batchSize: 10, forceFailure: true });

    const checked = await NotificationOutbox.findById(deadItem._id);
    expect(checked.status).toBe(OUTBOX_STATUS.DEAD_LETTER);
    expect(checked.attempts).toBe(3);
  });

  it('5. Manual Staff Retry: Re-queues DEAD_LETTER message back to PENDING', async () => {
    const deadItem = await NotificationOutbox.findOne({ status: OUTBOX_STATUS.DEAD_LETTER });

    const res = await request(app)
      .post(`/api/v1/staff/notifications/outbox/${deadItem._id}/retry`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(OUTBOX_STATUS.PENDING);
    expect(res.body.data.attempts).toBe(0);
  });

  it('6. Dynamic Wait Time Estimate: Uses observed completed consultation durations', async () => {
    const today = new Date().toISOString().split('T')[0];

    // Seed 2 completed consultations for Dr. Sharma with 15 mins observed duration each
    const startTime1 = new Date(Date.now() - 40 * 60 * 1000);
    const endTime1 = new Date(Date.now() - 25 * 60 * 1000); // 15 mins
    await QueueEntry.create({
      clinicId,
      queueDate: today,
      departmentId,
      doctorId,
      patientId: testPatient._id,
      tokenSequence: 1,
      publicToken: 'GEN-01',
      entryType: QUEUE_ENTRY_TYPE.BOOKED,
      queueStatus: QUEUE_STATUS.COMPLETED,
      servingAt: startTime1,
      completedAt: endTime1,
    });

    const startTime2 = new Date(Date.now() - 20 * 60 * 1000);
    const endTime2 = new Date(Date.now() - 5 * 60 * 1000); // 15 mins
    await QueueEntry.create({
      clinicId,
      queueDate: today,
      departmentId,
      doctorId,
      patientId: testPatient._id,
      tokenSequence: 2,
      publicToken: 'GEN-02',
      entryType: QUEUE_ENTRY_TYPE.BOOKED,
      queueStatus: QUEUE_STATUS.COMPLETED,
      servingAt: startTime2,
      completedAt: endTime2,
    });

    // Seed 3 waiting entries: GEN-03, GEN-04, GEN-05
    for (let seq = 3; seq <= 5; seq++) {
      await QueueEntry.create({
        clinicId,
        queueDate: today,
        departmentId,
        doctorId,
        patientId: testPatient._id,
        tokenSequence: seq,
        publicToken: `GEN-0${seq}`,
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.WAITING,
        checkedInAt: new Date(),
      });
    }

    // Estimate for GEN-05: GEN-03 and GEN-04 are ahead (2 patients ahead)
    // 2 patients ahead * 15 mins = 30 mins
    const res = await request(app)
      .get('/api/v1/notifications/estimate/GEN-05')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('GEN-05');
    expect(res.body.data.patientsAhead).toBe(2);
    expect(res.body.data.avgConsultationMins).toBe(15);
    expect(res.body.data.estimatedWaitMins).toBe(30);
    expect(res.body.data.disclaimer).toContain('approximate clinical estimates');
  });

  it('7. Approaching Turn Alert: Triggers alert when patientsAhead <= 2 or wait <= 15 mins', async () => {
    // Estimate for GEN-03: 0 patients ahead -> isApproaching is TRUE
    const res = await request(app)
      .get('/api/v1/notifications/estimate/GEN-03')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.patientsAhead).toBe(0);
    expect(res.body.data.isApproaching).toBe(true);
    expect(res.body.data.alertTriggered).toBe(true);

    const entry3 = await QueueEntry.findOne({ publicToken: 'GEN-03' });
    const outboxItem = await NotificationOutbox.findOne({ dedupKey: `approaching_${entry3._id}` });
    expect(outboxItem).toBeDefined();
    expect(outboxItem.message).toContain('Token GEN-03: You are next in line');
  });

  it('8. Approaching Turn Deduplication: Repeat calls suppress duplicate alerts (max 1 per visit)', async () => {
    const entry3 = await QueueEntry.findOne({ publicToken: 'GEN-03' });

    // Query estimate for GEN-03 again
    const res2 = await request(app)
      .get('/api/v1/notifications/estimate/GEN-03')
      .expect(200);

    expect(res2.body.success).toBe(true);
    expect(res2.body.data.isApproaching).toBe(true);
    expect(res2.body.data.alertTriggered).toBe(false); // suppressed by dedupKey!

    // Verify outbox still has exactly 1 record for this specific queue entry
    const count = await NotificationOutbox.countDocuments({ dedupKey: `approaching_${entry3._id}` });
    expect(count).toBe(1);
  });

  it('9. Staff Outbox Monitoring: Receptionist/Owner can inspect outbox counts and status', async () => {
    const res = await request(app)
      .get('/api/v1/staff/notifications/outbox')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.counts).toBeDefined();
    expect(res.body.counts.delivered).toBeGreaterThanOrEqual(1);
    expect(res.body.data).toBeDefined();
  });
});
