import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { Clinic, StaffUser, StaffSession } from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';

describe('Server-Side RBAC & Clinic Scoping Boundaries', () => {
  let clinicId;
  let ownerToken;
  let receptionistToken;

  beforeAll(async () => {
    await connectDB();
    await StaffUser.deleteMany({});
    await StaffSession.deleteMany({});
    await Clinic.deleteMany({});

    // Bootstrap owner
    const res = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerSecretPassword@123',
    });
    clinicId = res.clinicId;

    // Login owner
    const ownerLogin = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerSecretPassword@123');
    ownerToken = ownerLogin.sessionToken;

    // Create an active receptionist with valid bcrypt hash
    const receptionistPasswordHash = await bcrypt.hash('ReceptionSecret@123', 10);
    const receptionist = await StaffUser.create({
      clinicId,
      name: 'Priya Receptionist',
      email: 'priya@aarogyam.clinic',
      role: 'RECEPTIONIST',
      status: 'ACTIVE',
      passwordHash: receptionistPasswordHash,
    });

    const receptionistLogin = await staffAuthService.login('priya@aarogyam.clinic', 'ReceptionSecret@123');
    receptionistToken = receptionistLogin.sessionToken;
  });

  afterAll(async () => {
    await StaffUser.deleteMany({});
    await StaffSession.deleteMany({});
    await Clinic.deleteMany({});
    await disconnectDB();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/staff/members');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('blocks Receptionist from accessing Owner-only staff members management with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/staff/members')
      .set('Authorization', `Bearer ${receptionistToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Insufficient privileges');
  });

  it('allows Clinic Owner to access staff members list', async () => {
    const res = await request(app)
      .get('/api/v1/staff/members')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('allows Clinic Owner to update clinic settings', async () => {
    const res = await request(app)
      .patch('/api/v1/clinic/settings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        settings: { defaultDepositAmount: 150 },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.settings.defaultDepositAmount).toBe(150);
  });
});
