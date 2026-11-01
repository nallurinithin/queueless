import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database.js';
import { Clinic, StaffUser, STAFF_ROLES, STAFF_STATUS, Department, AuditLog } from '../models/index.js';
import { logger } from '../shared/logger.js';

/**
 * One-time Clinic Owner Bootstrap CLI
 * Executes in a private server shell. Verifies that no clinic owner already exists
 * to guarantee that bootstrap cannot be triggered repeatedly or publicly.
 */
export async function bootstrapOwner({
  ownerName = process.env.BOOTSTRAP_OWNER_NAME || 'Dr. Patel',
  ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL || 'admin@aarogyam.clinic',
  ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || 'AarogyamAdmin@2026',
  ownerPhone = process.env.BOOTSTRAP_OWNER_PHONE || '+919876500001',
  clinicName = process.env.BOOTSTRAP_CLINIC_NAME || 'Aarogyam Community Clinic',
  clinicSlug = process.env.BOOTSTRAP_CLINIC_SLUG || 'aarogyam-clinic',
} = {}) {
  // Check if an owner already exists
  const existingOwner = await StaffUser.findOne({ role: STAFF_ROLES.CLINIC_OWNER });
  if (existingOwner) {
    logger.warn('Clinic Owner already initialized. Refusing duplicate bootstrap.', {
      existingOwnerEmail: existingOwner.email,
    });
    return {
      success: false,
      alreadyInitialized: true,
      message: 'Clinic Owner already initialized. Refusing duplicate bootstrap.',
      ownerId: existingOwner._id.toString(),
    };
  }

  // Find or create clinic
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
        phone: ownerPhone,
        email: ownerEmail,
      },
      operatingHours: [
        { dayOfWeek: 1, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 2, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 3, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 4, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 5, isClosed: false, shifts: [{ startTime: '08:30', endTime: '13:30' }, { startTime: '16:30', endTime: '20:30' }] },
        { dayOfWeek: 6, isClosed: false, shifts: [{ startTime: '09:00', endTime: '14:00' }] },
        { dayOfWeek: 0, isClosed: true, shifts: [] }, // Sunday closed
      ],
      settings: {
        defaultConsultationDurationMins: 15,
        slotHoldDurationSecs: 300,
        defaultDepositAmount: 120,
      },
      depositPolicy: {
        enabled: true,
        defaultAmount: 120,
        walkInRequiresDeposit: false,
      },
      localesEnabled: ['en', 'hi', 'te'],
      isActive: true,
    });
  }

  // Create default departments if they don't exist
  const defaultDepts = [
    { name: 'General Medicine', code: 'GEN' },
    { name: 'Pediatrics', code: 'PED' },
    { name: 'Orthopedics', code: 'ORT' },
  ];

  const createdDepts = [];
  for (const dept of defaultDepts) {
    let d = await Department.findOne({ clinicId: clinic._id, name: dept.name });
    if (!d) {
      d = await Department.create({
        clinicId: clinic._id,
        name: dept.name,
        code: dept.code,
        active: true,
      });
    }
    createdDepts.push(d._id);
  }

  // Hash owner password
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(ownerPassword, saltRounds);

  // Create owner staff record
  const owner = await StaffUser.create({
    clinicId: clinic._id,
    name: ownerName,
    email: ownerEmail.toLowerCase().trim(),
    phone: ownerPhone,
    passwordHash,
    role: STAFF_ROLES.CLINIC_OWNER,
    status: STAFF_STATUS.ACTIVE,
    departmentIds: createdDepts,
  });

  // Create immutable audit entry
  await AuditLog.create({
    clinicId: clinic._id,
    actorId: owner._id,
    actorRole: STAFF_ROLES.CLINIC_OWNER,
    actorEmailOrPhone: owner.email,
    action: 'CLINIC_BOOTSTRAPPED',
    entityType: 'StaffUser',
    entityId: owner._id.toString(),
    details: {
      clinicId: clinic._id.toString(),
      clinicName: clinic.name,
      ownerEmail: owner.email,
    },
  });

  logger.info('Clinic Owner bootstrapped successfully.', {
    clinicId: clinic._id.toString(),
    clinicName: clinic.name,
    ownerEmail: owner.email,
    role: owner.role,
  });

  return {
    success: true,
    alreadyInitialized: false,
    clinicId: clinic._id.toString(),
    ownerId: owner._id.toString(),
    ownerEmail: owner.email,
  };
}

// CLI runner if script executed directly
if (process.argv[1]?.endsWith('bootstrap-owner.js')) {
  (async () => {
    try {
      await connectDB();
      const result = await bootstrapOwner();
      console.log(JSON.stringify(result, null, 2));
      await disconnectDB();
      process.exit(result.success ? 0 : 1);
    } catch (err) {
      console.error('Bootstrap failed with error:', err.message);
      await disconnectDB().catch(() => {});
      process.exit(1);
    }
  })();
}

