import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { Clinic, StaffUser, AuditLog, Department } from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';

describe('Clinic Owner Bootstrap CLI', () => {
  beforeAll(async () => {
    await connectDB();
    // Clean up test data for bootstrap
    await StaffUser.deleteMany({ email: 'test.admin@aarogyam.clinic' });
    await StaffUser.deleteMany({ role: 'CLINIC_OWNER' });
    await Clinic.deleteMany({ slug: 'test-aarogyam-clinic' });
    await Department.deleteMany({});
    await AuditLog.deleteMany({ action: 'CLINIC_BOOTSTRAPPED' });
  });

  afterAll(async () => {
    // Clean up
    await StaffUser.deleteMany({ email: 'test.admin@aarogyam.clinic' });
    await StaffUser.deleteMany({ role: 'CLINIC_OWNER' });
    await Clinic.deleteMany({ slug: 'test-aarogyam-clinic' });
    await Department.deleteMany({});
    await AuditLog.deleteMany({ action: 'CLINIC_BOOTSTRAPPED' });
    await disconnectDB();
  });

  it('successfully initializes clinic, owner, departments and audit trail on first run', async () => {
    const result = await bootstrapOwner({
      ownerName: 'Dr. Test Patel',
      ownerEmail: 'test.admin@aarogyam.clinic',
      ownerPassword: 'SecretPassword@2026',
      clinicName: 'Test Aarogyam Clinic',
      clinicSlug: 'test-aarogyam-clinic',
    });

    expect(result.success).toBe(true);
    expect(result.alreadyInitialized).toBe(false);
    expect(result.ownerEmail).toBe('test.admin@aarogyam.clinic');

    // Verify StaffUser record
    const owner = await StaffUser.findOne({ email: 'test.admin@aarogyam.clinic' });
    expect(owner).toBeDefined();
    expect(owner.role).toBe('CLINIC_OWNER');
    expect(owner.status).toBe('ACTIVE');

    // Verify password is encrypted with bcrypt
    const isMatch = await bcrypt.compare('SecretPassword@2026', owner.passwordHash);
    expect(isMatch).toBe(true);

    // Verify Clinic record
    const clinic = await Clinic.findOne({ slug: 'test-aarogyam-clinic' });
    expect(clinic).toBeDefined();
    expect(clinic.name).toBe('Test Aarogyam Clinic');

    // Verify departments created
    const depts = await Department.find({ clinicId: clinic._id });
    expect(depts.length).toBeGreaterThanOrEqual(3);

    // Verify AuditLog entry
    const audit = await AuditLog.findOne({ action: 'CLINIC_BOOTSTRAPPED', clinicId: clinic._id });
    expect(audit).toBeDefined();
    expect(audit.actorEmailOrPhone).toBe('test.admin@aarogyam.clinic');
  });

  it('refuses duplicate bootstrap and prevents duplicate owner creation on subsequent runs', async () => {
    const secondResult = await bootstrapOwner({
      ownerName: 'Imposter Admin',
      ownerEmail: 'imposter@aarogyam.clinic',
      ownerPassword: 'AnotherPassword',
      clinicName: 'Test Aarogyam Clinic',
      clinicSlug: 'test-aarogyam-clinic',
    });

    expect(secondResult.success).toBe(false);
    expect(secondResult.alreadyInitialized).toBe(true);
    expect(secondResult.message).toContain('already initialized');

    // Verify imposter was NOT created
    const imposter = await StaffUser.findOne({ email: 'imposter@aarogyam.clinic' });
    expect(imposter).toBeNull();

    // Verify only 1 owner exists in total
    const ownerCount = await StaffUser.countDocuments({ role: 'CLINIC_OWNER' });
    expect(ownerCount).toBe(1);
  });
});
