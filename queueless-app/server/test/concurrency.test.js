import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
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
} from '../src/models/index.js';
import { bootstrapOwner } from '../src/scripts/bootstrap-owner.js';
import { staffAuthService } from '../src/services/staffAuthService.js';

describe('Adversarial Concurrency: 50 Concurrent Requests for 1 Slot', () => {
  let clinicId;
  let departmentId;
  let doctorId;
  let receptionistToken;
  let appointments = [];

  beforeAll(async () => {
    await connectDB();
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
    await SlotHold.deleteMany({});

    // Bootstrap clinic and owner
    const boot = await bootstrapOwner({
      ownerName: 'Dr. Patel (Owner)',
      ownerEmail: 'admin@aarogyam.clinic',
      ownerPassword: 'OwnerPassword@123',
    });
    clinicId = boot.clinicId;

    const dept = await Department.findOne({ clinicId, name: 'General Medicine' });
    departmentId = dept._id;

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

    const ownerLogin = await staffAuthService.login('admin@aarogyam.clinic', 'OwnerPassword@123');
    receptionistToken = ownerLogin.sessionToken;

    // Create a base contact & patient
    const contact = await BookingContact.create({
      clinicId,
      phone: '9876543210',
      normalizedPhone: '+919876543210',
      isVerified: true,
    });
    const patient = await Patient.create({
      clinicId,
      fullName: 'Concurrency Patient',
      gender: 'MALE',
    });

    // Create 50 distinct pending appointments competing for the single slot
    const aptDocs = [];
    for (let i = 0; i < 50; i++) {
      aptDocs.push({
        clinicId,
        bookingReference: `QL-C${String(i).padStart(4, '0')}`,
        publicReferenceHash: `hash_${i}`,
        patientId: patient._id,
        bookingContactId: contact._id,
        departmentId,
        requestedWindow: {
          preferredDate: '2026-11-20',
          preferredTimeSlot: 'Morning',
        },
        status: 'PENDING_REVIEW',
      });
    }
    appointments = await Appointment.insertMany(aptDocs);
  });

  afterAll(async () => {
    await Clinic.deleteMany({});
    await StaffUser.deleteMany({});
    await Doctor.deleteMany({});
    await Department.deleteMany({});
    await BookingContact.deleteMany({});
    await Patient.deleteMany({});
    await Appointment.deleteMany({});
    await SlotHold.deleteMany({});
    await disconnectDB();
  });

  it('handles 50 simultaneous allocation requests: exactly 1 succeeds, 49 fail with conflict', async () => {
    const targetSlotDate = '2026-11-20';
    const targetStartTime = '10:00';
    const targetEndTime = '10:15';

    // Dispatch 50 concurrent requests in parallel using Promise.all
    const allocationPromises = appointments.map((apt) =>
      request(app)
        .post(`/api/v1/staff/appointments/${apt._id}/allocate`)
        .set('Authorization', `Bearer ${receptionistToken}`)
        .send({
          doctorId: doctorId.toString(),
          slotDate: targetSlotDate,
          startTime: targetStartTime,
          endTime: targetEndTime,
        })
    );

    const responses = await Promise.all(allocationPromises);

    // Count results
    const successes = responses.filter((r) => r.status === 200);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(49);

    // Verify in database: exactly ONE appointment transitioned to SLOT_HELD
    const heldAppointments = await Appointment.find({
      clinicId,
      assignedDoctorId: doctorId,
      'allocatedSlot.date': targetSlotDate,
      'allocatedSlot.startTime': targetStartTime,
      status: 'SLOT_HELD',
    });
    expect(heldAppointments.length).toBe(1);

    // Verify exactly ONE active capacity hold exists in database
    const capacityKey = `${clinicId.toString()}_${doctorId.toString()}_${targetSlotDate}_${targetStartTime}`;
    const holds = await SlotHold.find({ capacityKey, status: 'ACTIVE' });
    expect(holds.length).toBe(1);
  });
});
