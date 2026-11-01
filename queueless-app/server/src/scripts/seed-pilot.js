import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database.js';
import {
  Clinic,
  StaffUser,
  STAFF_ROLES,
  STAFF_STATUS,
  Department,
  Doctor,
  DoctorSchedule,
  Patient,
  BookingContact,
  PatientContactLink,
  AuditLog,
} from '../models/index.js';
import { logger } from '../shared/logger.js';

export async function seedPilotData({
  clinicName = 'Aarogyam Community Clinic',
  clinicSlug = 'aarogyam-clinic',
  resetTestData = false,
} = {}) {
  logger.info('Starting Aarogyam Community Clinic Pilot Onboarding Seed...');

  // 1. Find or create Clinic
  let clinic = await Clinic.findOne({ slug: clinicSlug });
  if (!clinic) {
    clinic = await Clinic.create({
      name: clinicName,
      slug: clinicSlug,
      timezone: 'Asia/Kolkata',
      address: {
        street: '12 Gandhi Road, Near Clock Tower',
        city: 'Hyderabad',
        state: 'Telangana',
        postalCode: '500001',
        country: 'IN',
      },
      contact: {
        phone: '+919876500001',
        email: 'admin@aarogyam.clinic',
      },
      operatingHours: [
        { dayOfWeek: 1, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 2, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 3, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 4, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 5, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 6, isClosed: false, shifts: [{ startTime: '09:00', endTime: '14:00' }] },
        { dayOfWeek: 0, isClosed: true, shifts: [] },
      ],
      settings: {
        defaultConsultationDurationMins: 15,
        slotHoldDurationSecs: 300,
        defaultDepositAmount: 100,
      },
      depositPolicy: {
        enabled: true,
        defaultAmount: 100,
        walkInRequiresDeposit: false,
      },
      localesEnabled: ['en', 'hi', 'te'],
      isActive: true,
    });
    logger.info(`Clinic created: ${clinic.name}`);
  } else {
    logger.info(`Using existing clinic: ${clinic.name}`);
  }

  // 2. Ensure Departments
  const deptDefs = [
    { name: 'General Medicine', code: 'GEN' },
    { name: 'Pediatrics', code: 'PED' },
    { name: 'Orthopedics', code: 'ORT' },
  ];

  const departments = {};
  for (const def of deptDefs) {
    let dept = await Department.findOne({ clinicId: clinic._id, code: def.code });
    if (!dept) {
      dept = await Department.create({
        clinicId: clinic._id,
        name: def.name,
        code: def.code,
        active: true,
      });
      logger.info(`Department created: ${def.name} (${def.code})`);
    }
    departments[def.code] = dept;
  }

  // 3. Ensure Staff Accounts
  const saltRounds = 10;
  const ownerPasswordHash = await bcrypt.hash('AarogyamAdmin@2026', saltRounds);
  const staffPasswordHash = await bcrypt.hash('AarogyamStaff@2026', saltRounds);

  // Clinic Owner
  let owner = await StaffUser.findOne({ clinicId: clinic._id, email: 'admin@aarogyam.clinic' });
  if (!owner) {
    owner = await StaffUser.create({
      clinicId: clinic._id,
      name: 'Dr. Patel (Owner)',
      email: 'admin@aarogyam.clinic',
      phone: '+919876500001',
      passwordHash: ownerPasswordHash,
      role: STAFF_ROLES.CLINIC_OWNER,
      status: STAFF_STATUS.ACTIVE,
      departmentIds: [departments.GEN._id, departments.PED._id, departments.ORT._id],
    });
    logger.info(`Owner account created: ${owner.email}`);
  }

  // Receptionist
  let receptionist = await StaffUser.findOne({ clinicId: clinic._id, email: 'reception@aarogyam.clinic' });
  if (!receptionist) {
    receptionist = await StaffUser.create({
      clinicId: clinic._id,
      name: 'Suresh Reddy (Desk)',
      email: 'reception@aarogyam.clinic',
      phone: '+919876500002',
      passwordHash: staffPasswordHash,
      role: STAFF_ROLES.RECEPTIONIST,
      status: STAFF_STATUS.ACTIVE,
      departmentIds: [departments.GEN._id, departments.PED._id, departments.ORT._id],
    });
    logger.info(`Receptionist account created: ${receptionist.email}`);
  }

  // Doctor 1: Dr. Ananya Sharma (General Medicine)
  let doctorStaff1 = await StaffUser.findOne({ clinicId: clinic._id, email: 'dr.sharma@aarogyam.clinic' });
  if (!doctorStaff1) {
    doctorStaff1 = await StaffUser.create({
      clinicId: clinic._id,
      name: 'Dr. Ananya Sharma',
      email: 'dr.sharma@aarogyam.clinic',
      phone: '+919876500003',
      passwordHash: staffPasswordHash,
      role: STAFF_ROLES.DOCTOR,
      status: STAFF_STATUS.ACTIVE,
      departmentIds: [departments.GEN._id],
    });
    logger.info(`Doctor staff created: ${doctorStaff1.email}`);
  }

  let doctor1 = await Doctor.findOne({ clinicId: clinic._id, staffUserId: doctorStaff1._id });
  if (!doctor1) {
    doctor1 = await Doctor.create({
      clinicId: clinic._id,
      staffUserId: doctorStaff1._id,
      departmentIds: [departments.GEN._id],
      roomNumber: 'Room 101',
      scheduleConfig: {
        defaultSlotDurationMins: 15,
        bufferMins: 0,
        maxAppointmentsPerSlot: 1,
      },
      active: true,
    });
    logger.info(`Doctor record created for Dr. Sharma: Room 101`);
  }

  // Doctor 2: Dr. Rajesh Rao (Pediatrics)
  let doctorStaff2 = await StaffUser.findOne({ clinicId: clinic._id, email: 'dr.rao@aarogyam.clinic' });
  if (!doctorStaff2) {
    doctorStaff2 = await StaffUser.create({
      clinicId: clinic._id,
      name: 'Dr. Rajesh Rao',
      email: 'dr.rao@aarogyam.clinic',
      phone: '+919876500004',
      passwordHash: staffPasswordHash,
      role: STAFF_ROLES.DOCTOR,
      status: STAFF_STATUS.ACTIVE,
      departmentIds: [departments.PED._id],
    });
    logger.info(`Doctor staff created: ${doctorStaff2.email}`);
  }

  let doctor2 = await Doctor.findOne({ clinicId: clinic._id, staffUserId: doctorStaff2._id });
  if (!doctor2) {
    doctor2 = await Doctor.create({
      clinicId: clinic._id,
      staffUserId: doctorStaff2._id,
      departmentIds: [departments.PED._id],
      roomNumber: 'Room 102',
      scheduleConfig: {
        defaultSlotDurationMins: 15,
        bufferMins: 0,
        maxAppointmentsPerSlot: 1,
      },
      active: true,
    });
    logger.info(`Doctor record created for Dr. Rao: Room 102`);
  }

  // 4. Ensure Doctor Weekly Schedules
  const standardShifts = [
    { startTime: '09:00', endTime: '13:00', slotDurationMins: 15, maxPatientsPerSlot: 1 },
    { startTime: '16:30', endTime: '20:00', slotDurationMins: 15, maxPatientsPerSlot: 1 },
  ];

  const weeklySchedule = [1, 2, 3, 4, 5, 6].map((day) => ({
    dayOfWeek: day,
    isWorking: true,
    shifts: standardShifts,
  }));
  weeklySchedule.push({ dayOfWeek: 0, isWorking: false, shifts: [] }); // Sunday off

  for (const doc of [doctor1, doctor2]) {
    let sched = await DoctorSchedule.findOne({ clinicId: clinic._id, doctorId: doc._id });
    if (!sched) {
      sched = await DoctorSchedule.create({
        clinicId: clinic._id,
        doctorId: doc._id,
        weeklySchedule,
        unavailability: [],
      });
      logger.info(`Weekly schedule seeded for Doctor ID: ${doc._id}`);
    }
  }

  // 5. Ensure Pilot Demo Patients (Family Household under +919876543210)
  const sharedPhone = '+919876543210';
  let contact = await BookingContact.findOne({ clinicId: clinic._id, normalizedPhone: sharedPhone });
  if (!contact) {
    contact = await BookingContact.create({
      clinicId: clinic._id,
      phone: sharedPhone,
      normalizedPhone: sharedPhone,
      isVerified: true,
      lastVerifiedAt: new Date(),
    });
    logger.info(`Shared Booking Contact created: ${sharedPhone}`);
  }

  const patientSeedData = [
    { fullName: 'Ramesh Kumar', age: 42, gender: 'MALE', relationship: 'SELF', isDefault: true },
    { fullName: 'Sunita Kumar', age: 39, gender: 'FEMALE', relationship: 'SPOUSE', isDefault: false },
    { fullName: 'Aarav Kumar', age: 10, gender: 'MALE', relationship: 'CHILD', isDefault: false },
  ];

  const createdPatients = [];
  for (const pData of patientSeedData) {
    let patient = await Patient.findOne({
      clinicId: clinic._id,
      fullName: pData.fullName,
      gender: pData.gender,
    });
    if (!patient) {
      patient = await Patient.create({
        clinicId: clinic._id,
        fullName: pData.fullName,
        age: pData.age,
        gender: pData.gender,
      });
      logger.info(`Patient created: ${patient.fullName} (${patient.gender}, ${patient.age}y)`);
    }

    // Link to shared contact
    let link = await PatientContactLink.findOne({
      clinicId: clinic._id,
      patientId: patient._id,
      bookingContactId: contact._id,
    });
    if (!link) {
      await PatientContactLink.create({
        clinicId: clinic._id,
        patientId: patient._id,
        bookingContactId: contact._id,
        relationship: pData.relationship,
        isDefault: pData.isDefault,
      });
    }
    createdPatients.push(patient);
  }

  // 6. Audit Log
  await AuditLog.create({
    clinicId: clinic._id,
    actorId: owner._id,
    actorRole: STAFF_ROLES.CLINIC_OWNER,
    actorEmailOrPhone: owner.email,
    action: 'PILOT_DATA_SEEDED',
    entityType: 'Clinic',
    entityId: clinic._id.toString(),
    details: {
      clinicName: clinic.name,
      departments: ['GEN', 'PED', 'ORT'],
      staffSeeded: [owner.email, receptionist.email, doctorStaff1.email, doctorStaff2.email],
      patientsSeeded: createdPatients.map((p) => p.fullName),
    },
  });

  logger.info('Aarogyam Community Clinic Pilot Onboarding Seed Completed Successfully.');

  return {
    success: true,
    clinic: { id: clinic._id.toString(), name: clinic.name, slug: clinic.slug },
    staffCredentials: [
      { role: 'CLINIC_OWNER', email: 'admin@aarogyam.clinic', password: 'AarogyamAdmin@2026', name: 'Dr. Patel' },
      { role: 'RECEPTIONIST', email: 'reception@aarogyam.clinic', password: 'AarogyamStaff@2026', name: 'Suresh Reddy' },
      { role: 'DOCTOR (GEN)', email: 'dr.sharma@aarogyam.clinic', password: 'AarogyamStaff@2026', name: 'Dr. Ananya Sharma' },
      { role: 'DOCTOR (PED)', email: 'dr.rao@aarogyam.clinic', password: 'AarogyamStaff@2026', name: 'Dr. Rajesh Rao' },
    ],
    demoPatientContact: {
      phone: sharedPhone,
      patients: createdPatients.map((p) => ({ id: p._id.toString(), name: p.fullName, age: p.age, gender: p.gender })),
    },
  };
}

if (process.argv[1]?.endsWith('seed-pilot.js')) {
  (async () => {
    try {
      await connectDB();
      const res = await seedPilotData();
      console.log('\n================ PILOT SEED COMPLETE ================');
      console.log(JSON.stringify(res, null, 2));
      console.log('=====================================================\n');
      await disconnectDB();
      process.exit(0);
    } catch (err) {
      console.error('Pilot seed failed:', err);
      await disconnectDB().catch(() => {});
      process.exit(1);
    }
  })();
}
