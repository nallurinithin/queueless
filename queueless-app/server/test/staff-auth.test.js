import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { Clinic, StaffUser, StaffInvitationToken, StaffSession } from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';

describe('Staff Authentication & Lifecycle API (/api/v1/staff)', () => {
  let clinicId;
  let ownerToken;
  let invitedStaffToken;
  let invitedStaffId;

  beforeAll(async () => {
    await connectDB();
    await StaffUser.deleteMany({});
    await StaffInvitationToken.deleteMany({});
    await StaffSession.deleteMany({});
    await Clinic.deleteMany({});

    // Bootstrap owner
    const res = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerSecretPassword@123',
    });
    clinicId = res.clinicId;
  });

  afterAll(async () => {
    await StaffUser.deleteMany({});
    await StaffInvitationToken.deleteMany({});
    await StaffSession.deleteMany({});
    await Clinic.deleteMany({});
    await disconnectDB();
  });

  it('authenticates clinic owner with valid credentials and returns redirect path', async () => {
    const res = await request(app)
      .post('/api/v1/staff/auth/login')
      .send({ email: 'admin@aarogyam.clinic', password: 'OwnerSecretPassword@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('CLINIC_OWNER');
    expect(res.body.redirectPath).toBe('/staff/owner');
    expect(res.body.token).toBeDefined();

    ownerToken = res.body.token;

    // Verify cookie set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.includes('queueless_staff_session'))).toBe(true);
  });

  it('rejects invalid password with 401', async () => {
    const res = await request(app)
      .post('/api/v1/staff/auth/login')
      .send({ email: 'admin@aarogyam.clinic', password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('allows owner to invite a new receptionist', async () => {
    const res = await request(app)
      .post('/api/v1/staff/invitations')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Priya Receptionist',
        email: 'priya.reception@aarogyam.clinic',
        role: 'RECEPTIONIST',
        phone: '+919876543211',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.staffUser.status).toBe('INVITED');
    expect(res.body.data.invitationToken).toBeDefined();

    invitedStaffToken = res.body.data.invitationToken;
    invitedStaffId = res.body.data.staffUser.id;

    // Verify account passwordHash is null in database
    const staff = await StaffUser.findById(invitedStaffId);
    expect(staff.passwordHash).toBeNull();
  });

  it('blocks pending invited staff from logging in before activation', async () => {
    const res = await request(app)
      .post('/api/v1/staff/auth/login')
      .send({ email: 'priya.reception@aarogyam.clinic', password: 'anyPassword' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('pending activation');
  });

  it('allows invited staff to activate account by setting their own password', async () => {
    const res = await request(app)
      .post('/api/v1/staff/auth/activate')
      .send({
        token: invitedStaffToken,
        password: 'PriyaSecurePassword@2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const staff = await StaffUser.findById(invitedStaffId);
    expect(staff.status).toBe('ACTIVE');
    expect(staff.passwordHash).toBeDefined();
  });

  it('prevents reuse of the same invitation token', async () => {
    const res = await request(app)
      .post('/api/v1/staff/auth/activate')
      .send({
        token: invitedStaffToken,
        password: 'AnotherPassword@2026',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid, expired, or already used');
  });

  it('allows newly activated receptionist to login and returns /staff/receptionist route', async () => {
    const res = await request(app)
      .post('/api/v1/staff/auth/login')
      .send({
        email: 'priya.reception@aarogyam.clinic',
        password: 'PriyaSecurePassword@2026',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('RECEPTIONIST');
    expect(res.body.redirectPath).toBe('/staff/receptionist');
  });

  it('allows owner to deactivate staff member, immediately revoking access', async () => {
    const res = await request(app)
      .patch(`/api/v1/staff/members/${invitedStaffId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'DEACTIVATED' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Login must now be forbidden
    const loginRes = await request(app)
      .post('/api/v1/staff/auth/login')
      .send({
        email: 'priya.reception@aarogyam.clinic',
        password: 'PriyaSecurePassword@2026',
      });

    expect(loginRes.status).toBe(403);
    expect(loginRes.body.error).toContain('deactivated');
  });
});

