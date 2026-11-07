/**
 * QueueLess Test Data Seeder for Load & E2E Testing
 *
 * Populates local queueless_test database with deterministic test fixtures:
 * - Clinic, Departments, Doctors, Receptionist, Owner
 * - Pre-authenticated Staff & Patient Sessions
 * - 1,000 Confirmed Appointments for Check-In Load Testing
 * - 500 Waiting Queue Entries for Call-Next / Consultation Load Testing
 * - Exports test-data.json for k6 scripts
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/queueless_test?directConnection=true';

import {
  Clinic,
  Department,
  Doctor,
  StaffUser,
  StaffSession,
  BookingContact,
  Patient,
  PatientContactLink,
  PatientSession,
  Appointment,
  QueueEntry,
  QueueSequenceCounter,
  SlotHold,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  QUEUE_STATUS,
  QUEUE_ENTRY_TYPE,
  STAFF_ROLES,
  STAFF_STATUS,
} from '../src/models/index.js';
import { connectDatabase, APPROVED_TEST_DB_NAME } from '../src/config/database.js';

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DATA_PATH = path.resolve(__dirname, '../../../tests/performance/k6/test-data.json');

export async function seedLoadTestData() {
  console.log('--- Connecting to local test database ---');
  await connectDatabase(process.env.MONGODB_URI);

  if (mongoose.connection.name !== APPROVED_TEST_DB_NAME) {
    throw new Error(`[SECURITY] Safety check failed: connected to ${mongoose.connection.name} instead of ${APPROVED_TEST_DB_NAME}`);
  }

  console.log(`✓ Verified connected to: ${mongoose.connection.name}`);
  console.log('--- Purging existing test collections in queueless_test ---');

  await Promise.all([
    Clinic.deleteMany({}),
    Department.deleteMany({}),
    Doctor.deleteMany({}),
    StaffUser.deleteMany({}),
    StaffSession.deleteMany({}),
    BookingContact.deleteMany({}),
    Patient.deleteMany({}),
    PatientContactLink.deleteMany({}),
    PatientSession.deleteMany({}),
    Appointment.deleteMany({}),
    QueueEntry.deleteMany({}),
    QueueSequenceCounter.deleteMany({}),
    SlotHold.deleteMany({}),
  ]);

  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
  const sessionExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  console.log('--- Seeding Clinic & Operating Hours ---');
  const operatingHours = [];
  for (let d = 0; d < 7; d++) {
    operatingHours.push({
      dayOfWeek: d,
      isClosed: false,
      shifts: [
        { name: 'Morning', startTime: '08:30', endTime: '13:30', maxAppointments: 50 },
        { name: 'Evening', startTime: '16:30', endTime: '20:30', maxAppointments: 50 },
      ],
    });
  }

  const clinic = await Clinic.create({
    name: 'Aarogyam Community Clinic (Load Test)',
    slug: 'aarogyam-load-test',
    code: 'ARGYAM',
    address: '12-34 Health Highway, Hyderabad, Telangana',
    phone: '+919876543200',
    isActive: true,
    operatingHours,
    depositPolicy: {
      enabled: false, // Disabled for pure queue & concurrency testing; walk-in & online test
      defaultAmount: 100,
    },
    cancellationPolicy: {
      deadlineHours: 2,
      refundPercentageBeforeDeadline: 100,
      refundPercentageAfterDeadline: 0,
    },
    tvDisplay: {
      broadcastEnabled: true,
      showPatientName: true,
      announcementLanguage: 'en',
    },
  });

  console.log('--- Seeding Departments ---');
  const deptGeneral = await Department.create({
    clinicId: clinic._id,
    name: 'General Medicine',
    code: 'GEN',
    description: 'General outpatient consultations and triaging',
    active: true,
  });

  const deptPediatrics = await Department.create({
    clinicId: clinic._id,
    name: 'Pediatrics',
    code: 'PED',
    description: 'Child healthcare and pediatric checkups',
    active: true,
  });

  console.log('--- Seeding Staff Users ---');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const ownerStaff = await StaffUser.create({
    clinicId: clinic._id,
    name: 'Dr. Nithin',
    email: 'owner@test.clinic',
    passwordHash,
    role: STAFF_ROLES.CLINIC_OWNER,
    status: STAFF_STATUS.ACTIVE,
  });

  const receptionistStaff = await StaffUser.create({
    clinicId: clinic._id,
    name: 'Snehith Receptionist',
    email: 'receptionist@test.clinic',
    passwordHash,
    role: STAFF_ROLES.RECEPTIONIST,
    status: STAFF_STATUS.ACTIVE,
  });

  const doctor1Staff = await StaffUser.create({
    clinicId: clinic._id,
    name: 'Dr. Suresh',
    email: 'doctor1@test.clinic',
    passwordHash,
    role: STAFF_ROLES.DOCTOR,
    status: STAFF_STATUS.ACTIVE,
  });

  const doctor2Staff = await StaffUser.create({
    clinicId: clinic._id,
    name: 'Dr. Rajesh',
    email: 'doctor2@test.clinic',
    passwordHash,
    role: STAFF_ROLES.DOCTOR,
    status: STAFF_STATUS.ACTIVE,
  });

  console.log('--- Seeding Doctors ---');
  const doctor1 = await Doctor.create({
    clinicId: clinic._id,
    staffUserId: doctor1Staff._id,
    departmentIds: [deptGeneral._id],
    roomNumber: 'Room 101',
    active: true,
  });

  const doctor2 = await Doctor.create({
    clinicId: clinic._id,
    staffUserId: doctor2Staff._id,
    departmentIds: [deptPediatrics._id],
    roomNumber: 'Room 102',
    active: true,
  });

  console.log('--- Seeding Staff Pre-Authenticated Sessions ---');
  const RAW_TOKENS = {
    owner: 'raw_owner_session_token_loadtest_secure_12345',
    receptionist: 'raw_receptionist_session_token_loadtest_secure_12345',
    doctor1: 'raw_doctor1_session_token_loadtest_secure_12345',
    doctor2: 'raw_doctor2_session_token_loadtest_secure_12345',
  };

  await StaffSession.create([
    {
      clinicId: clinic._id,
      staffUserId: ownerStaff._id,
      sessionTokenHash: hashToken(RAW_TOKENS.owner),
      expiresAt: sessionExpiry,
    },
    {
      clinicId: clinic._id,
      staffUserId: receptionistStaff._id,
      sessionTokenHash: hashToken(RAW_TOKENS.receptionist),
      expiresAt: sessionExpiry,
    },
    {
      clinicId: clinic._id,
      staffUserId: doctor1Staff._id,
      sessionTokenHash: hashToken(RAW_TOKENS.doctor1),
      expiresAt: sessionExpiry,
    },
    {
      clinicId: clinic._id,
      staffUserId: doctor2Staff._id,
      sessionTokenHash: hashToken(RAW_TOKENS.doctor2),
      expiresAt: sessionExpiry,
    },
  ]);

  console.log('--- Seeding 50 Patient Booking Contacts & Sessions ---');
  const patientTokens = [];
  const patientDataList = [];

  for (let i = 1; i <= 50; i++) {
    const phone = `98765${String(i).padStart(5, '0')}`;
    const rawToken = `raw_patient_session_token_${i}_secure_abc`;
    patientTokens.push(rawToken);

    const contact = await BookingContact.create({
      clinicId: clinic._id,
      phone,
      normalizedPhone: `+91${phone}`,
      isVerified: true,
      lastVerifiedAt: now,
    });

    const patient = await Patient.create({
      clinicId: clinic._id,
      fullName: `Test Patient ${i}`,
      age: 20 + (i % 50),
      gender: i % 2 === 0 ? 'FEMALE' : 'MALE',
    });

    await PatientContactLink.create({
      clinicId: clinic._id,
      bookingContactId: contact._id,
      patientId: patient._id,
      relationship: 'SELF',
      isPrimary: true,
    });

    await PatientSession.create({
      clinicId: clinic._id,
      bookingContactId: contact._id,
      sessionTokenHash: hashToken(rawToken),
      expiresAt: sessionExpiry,
      absoluteExpiresAt: sessionExpiry,
    });

    patientDataList.push({
      contactId: contact._id.toString(),
      patientId: patient._id.toString(),
      phone,
      token: rawToken,
    });
  }

  console.log('--- Seeding 1,000 Confirmed Appointments (for Check-In load testing) ---');
  const appointmentBatch = [];
  const bookingReferences = [];

  for (let i = 1; i <= 1000; i++) {
    const ref = `CHK-LOAD-${String(i).padStart(4, '0')}`;
    bookingReferences.push(ref);
    const assignedDoc = i % 2 === 0 ? doctor1 : doctor2;
    const assignedDept = i % 2 === 0 ? deptGeneral : deptPediatrics;
    const patientObj = patientDataList[i % patientDataList.length];

    appointmentBatch.push({
      clinicId: clinic._id,
      bookingContactId: patientObj.contactId,
      patientId: patientObj.patientId,
      departmentId: assignedDept._id,
      assignedDoctorId: assignedDoc._id,
      bookingReference: ref,
      publicReferenceHash: hashToken(ref),
      requestedWindow: {
        preferredDate: todayStr,
        preferredTimeSlot: 'Morning',
        reasonCategory: 'General Consultation',
      },
      status: APPOINTMENT_STATUS.CONFIRMED,
      paymentStatus: PAYMENT_STATUS.NOT_REQUIRED,
      allocatedSlot: {
        date: todayStr,
        startTime: '09:00',
        endTime: '09:15',
      },
      depositRequired: false,
      depositAmount: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  await Appointment.insertMany(appointmentBatch);

  console.log('--- Seeding 500 Waiting Queue Entries (for Call-Next / Serve / Complete load testing) ---');
  const queueBatch = [];
  const queueEntryIds = [];

  for (let i = 1; i <= 500; i++) {
    const isDoc1 = i <= 250;
    const doc = isDoc1 ? doctor1 : doctor2;
    const dept = isDoc1 ? deptGeneral : deptPediatrics;
    const seq = isDoc1 ? i : i - 250;
    const prefix = isDoc1 ? 'GEN' : 'PED';
    const publicToken = `${prefix}-${String(seq).padStart(2, '0')}`;
    const patientObj = patientDataList[i % patientDataList.length];

    queueBatch.push({
      clinicId: clinic._id,
      doctorId: doc._id,
      departmentId: dept._id,
      patientId: patientObj.patientId,
      queueDate: todayStr,
      tokenSequence: seq,
      publicToken,
      entryType: QUEUE_ENTRY_TYPE.WALK_IN,
      queueStatus: QUEUE_STATUS.WAITING,
      checkedInAt: new Date(now.getTime() - (500 - i) * 1000),
      estimatedWaitMins: seq * 8,
    });
  }
  const insertedQueue = await QueueEntry.insertMany(queueBatch);
  insertedQueue.forEach((q) => queueEntryIds.push(q._id.toString()));

  // Set sequence counters idempotently
  await QueueSequenceCounter.findOneAndUpdate(
    { clinicId: clinic._id, doctorId: doctor1._id, queueDate: todayStr },
    { $set: { lastSequence: 250 } },
    { upsert: true }
  );
  await QueueSequenceCounter.findOneAndUpdate(
    { clinicId: clinic._id, doctorId: doctor2._id, queueDate: todayStr },
    { $set: { lastSequence: 250 } },
    { upsert: true }
  );

  const testConfig = {
    baseUrl: 'http://127.0.0.1:5005',
    clinicId: clinic._id.toString(),
    todayDate: todayStr,
    departments: [
      { id: deptGeneral._id.toString(), name: deptGeneral.name, code: deptGeneral.code },
      { id: deptPediatrics._id.toString(), name: deptPediatrics.name, code: deptPediatrics.code },
    ],
    doctors: [
      { id: doctor1._id.toString(), name: 'Dr. Suresh', room: 'Room 101', staffUserId: doctor1Staff._id.toString(), deptId: deptGeneral._id.toString() },
      { id: doctor2._id.toString(), name: 'Dr. Rajesh', room: 'Room 102', staffUserId: doctor2Staff._id.toString(), deptId: deptPediatrics._id.toString() },
    ],
    tokens: {
      owner: RAW_TOKENS.owner,
      receptionist: RAW_TOKENS.receptionist,
      doctor1: RAW_TOKENS.doctor1,
      doctor2: RAW_TOKENS.doctor2,
    },
    patientTokens,
    bookingReferences,
    queueEntryIds,
  };

  fs.writeFileSync(OUTPUT_DATA_PATH, JSON.stringify(testConfig, null, 2), 'utf-8');
  console.log(`✓ Test configuration exported successfully to: ${OUTPUT_DATA_PATH}`);
  console.log(`  Seeded: 1 Clinic, 2 Depts, 2 Doctors, 1 Receptionist, 50 Patients, 1,000 Confirmed Appts, 500 Queue Entries.`);

  await mongoose.disconnect();
  return testConfig;
}

// Allow direct CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedLoadTestData()
    .then(() => {
      console.log('✓ Seeding complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('✗ Seeding failed:', err);
      process.exit(1);
    });
}
