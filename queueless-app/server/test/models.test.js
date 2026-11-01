import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import {
  Clinic,
  StaffUser,
  STAFF_ROLES,
  STAFF_STATUS,
  StaffInvitationToken,
  StaffPasswordResetToken,
  StaffSession,
  Patient,
  GENDER,
  BookingContact,
  PatientContactLink,
  RELATIONSHIPS,
  PatientSession,
  AuditLog,
} from '../src/models/index.js';

describe('M2 Core Data Models & Schema Invariants', () => {
  it('validates Clinic default settings and deposit policy', () => {
    const clinic = new Clinic({
      name: 'Aarogyam Community Clinic',
      slug: 'aarogyam-clinic',
    });

    expect(clinic.timezone).toBe('Asia/Kolkata');
    expect(clinic.settings.slotHoldDurationSecs).toBe(300); // 5 minutes
    expect(clinic.settings.defaultDepositAmount).toBe(120);
    expect(clinic.depositPolicy.walkInRequiresDeposit).toBe(false); // Walk-ins pay 0 advance deposit
    expect(clinic.localesEnabled).toEqual(['en', 'hi', 'te']);
  });

  it('validates StaffUser schema, roles, and status enums', () => {
    const clinicId = new mongoose.Types.ObjectId();
    const staff = new StaffUser({
      clinicId,
      name: 'Dr. Sharma',
      email: 'dr.sharma@aarogyam.clinic',
      role: STAFF_ROLES.DOCTOR,
      status: STAFF_STATUS.INVITED,
    });

    expect(staff.role).toBe('DOCTOR');
    expect(staff.status).toBe('INVITED');
    expect(staff.passwordHash).toBeNull(); // Null when invited

    // Invalid role must fail validation
    const invalidStaff = new StaffUser({
      clinicId,
      name: 'Fake Staff',
      email: 'fake@aarogyam.clinic',
      role: 'SUPER_ADMIN', // not in enum
    });
    const err = invalidStaff.validateSync();
    expect(err.errors.role).toBeDefined();
  });

  it('validates Patient lifetime identity and absence of diagnosis/clinical fields', () => {
    const clinicId = new mongoose.Types.ObjectId();
    const patient = new Patient({
      clinicId,
      fullName: 'Ramesh Kumar',
      gender: GENDER.MALE,
      age: 45,
    });

    expect(patient.fullName).toBe('Ramesh Kumar');
    expect(patient.gender).toBe('MALE');
    expect(patient.age).toBe(45);
    // Explicitly verify diagnosis or clinical history fields do not exist on the schema
    expect(patient.schema.paths.diagnosis).toBeUndefined();
    expect(patient.schema.paths.medicalHistory).toBeUndefined();
    expect(patient.schema.paths.prescription).toBeUndefined();
  });

  it('validates BookingContact and PatientContactLink relationship mapping', () => {
    const clinicId = new mongoose.Types.ObjectId();
    const contactId = new mongoose.Types.ObjectId();
    const patientId = new mongoose.Types.ObjectId();

    const contact = new BookingContact({
      clinicId,
      phone: '9876543210',
      normalizedPhone: '+919876543210',
    });
    expect(contact.isVerified).toBe(false);

    const link = new PatientContactLink({
      clinicId,
      bookingContactId: contactId,
      patientId,
      relationship: RELATIONSHIPS.CHILD,
    });
    expect(link.relationship).toBe('CHILD');
  });

  it('validates PatientSession idle and absolute expiration policies', () => {
    const clinicId = new mongoose.Types.ObjectId();
    const contactId = new mongoose.Types.ObjectId();
    const now = new Date();
    const idleExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const absoluteExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = new PatientSession({
      clinicId,
      bookingContactId: contactId,
      sessionTokenHash: 'mock_sha256_hash_value',
      expiresAt: idleExpiresAt,
      absoluteExpiresAt,
    });

    expect(session.expiresAt.getTime()).toBeGreaterThan(now.getTime());
    expect(session.absoluteExpiresAt.getTime()).toBeGreaterThan(session.expiresAt.getTime());
    expect(session.revokedAt).toBeNull();
  });

  it('validates AuditLog immutability (no updatedAt field)', () => {
    const clinicId = new mongoose.Types.ObjectId();
    const audit = new AuditLog({
      clinicId,
      action: 'STAFF_INVITED',
      entityType: 'StaffUser',
      entityId: 'staff_123',
      actorRole: 'CLINIC_OWNER',
    });

    expect(audit.action).toBe('STAFF_INVITED');
    expect(audit.schema.paths.updatedAt).toBeUndefined(); // Immutable
    expect(audit.schema.paths.createdAt).toBeDefined();
  });
});

