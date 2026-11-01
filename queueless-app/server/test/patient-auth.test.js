import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { Clinic, BookingContact, Patient, PatientContactLink, PatientSession } from '../src/models/index.js';

describe('Patient Phone OTP & Persistent Session API (/api/v1/patient/auth)', () => {
  let clinic;
  let patientSessionCookie;
  let sessionToken;

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await PatientContactLink.deleteMany({});
    await PatientSession.deleteMany({});

    clinic = await Clinic.create({
      name: 'Aarogyam Community Clinic',
      slug: 'aarogyam-clinic',
      isActive: true,
    });
  });

  afterAll(async () => {
    await Clinic.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await PatientContactLink.deleteMany({});
    await PatientSession.deleteMany({});
    await disconnectDB();
  });

  it('requests OTP for valid phone number', async () => {
    const res = await request(app)
      .post('/api/v1/patient/auth/request-otp')
      .send({ phone: '9876543210' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.normalizedPhone).toBe('+919876543210');
  });

  it('enforces 60-second cooldown on immediate re-request', async () => {
    const res = await request(app)
      .post('/api/v1/patient/auth/request-otp')
      .send({ phone: '9876543210' });

    expect(res.status).toBe(429);
    expect(res.body.error).toContain('wait');
  });

  it('verifies OTP and sets persistent HttpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/v1/patient/auth/verify-otp')
      .send({ phone: '9876543210', otp: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contact.normalizedPhone).toBe('+919876543210');
    expect(res.body.data.token).toBeDefined();

    sessionToken = res.body.data.token;

    // Check cookie
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    patientSessionCookie = cookies.find((c) => c.includes('queueless_patient_session'));
    expect(patientSessionCookie).toBeDefined();
    expect(patientSessionCookie).toContain('HttpOnly');
  });

  it('restores patient session on page refresh without requiring new OTP', async () => {
    const res = await request(app)
      .get('/api/v1/patient/auth/session')
      .set('Cookie', [patientSessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.data.contact.normalizedPhone).toBe('+919876543210');
    expect(res.body.data.linkedPatients.length).toBeGreaterThanOrEqual(1);
  });

  it('allows adding a family member under the same verified contact', async () => {
    const res = await request(app)
      .post('/api/v1/patient/auth/family-members')
      .set('Cookie', [patientSessionCookie])
      .send({
        fullName: 'Suresh Kumar',
        gender: 'MALE',
        age: 12,
        relationship: 'CHILD',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fullName).toBe('Suresh Kumar');
    expect(res.body.data.relationship).toBe('CHILD');

    // Verify session call now shows both family members
    const sessionRes = await request(app)
      .get('/api/v1/patient/auth/session')
      .set('Cookie', [patientSessionCookie]);

    expect(sessionRes.body.data.linkedPatients.length).toBe(2);
    const names = sessionRes.body.data.linkedPatients.map((p) => p.fullName);
    expect(names).toContain('Suresh Kumar');
  });

  it('allows patient to logout, revoking session and clearing cookie', async () => {
    const res = await request(app)
      .post('/api/v1/patient/auth/logout')
      .set('Cookie', [patientSessionCookie]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Subsequent session check must now return unauthenticated
    const checkRes = await request(app)
      .get('/api/v1/patient/auth/session')
      .set('Cookie', [patientSessionCookie]);

    expect(checkRes.body.authenticated).toBe(false);
  });
});
