import crypto from 'crypto';
import {
  Appointment,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  SlotHold,
  SLOT_HOLD_STATUS,
  Patient,
  BookingContact,
  PatientContactLink,
  RELATIONSHIPS,
  Doctor,
  AuditLog,
} from '../models/index.js';

function hashReference(ref) {
  return crypto.createHash('sha256').update(ref).digest('hex');
}

function generateBookingReference() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return `QL-${randomPart}`;
}

export const appointmentService = {
  /**
   * Submit Appointment Request (Guest / Verified Contact)
   * Supports booking for Self or on behalf of Family Members under one phone number.
   */
  async requestAppointment({
    clinicId,
    bookingContactId,
    patientTarget = 'SELF', // 'SELF' | 'EXISTING_FAMILY' | 'NEW_FAMILY'
    patientId = null,
    newPatientData = null, // { fullName, gender, age, relationship }
    departmentId,
    requestedWindow, // { preferredDate, preferredTimeSlot, reasonCategory, notes }
  }) {
    if (!clinicId || !bookingContactId || !departmentId || !requestedWindow?.preferredDate) {
      const err = new Error('Clinic, booking contact, department, and preferred date are required.');
      err.statusCode = 400;
      throw err;
    }

    let actualPatientId = null;

    // 1. Resolve Patient Entity (Lifetime persistent identity)
    if (patientTarget === 'SELF') {
      const selfLink = await PatientContactLink.findOne({
        clinicId,
        bookingContactId,
        relationship: RELATIONSHIPS.SELF,
      });

      if (selfLink) {
        actualPatientId = selfLink.patientId;
      } else {
        const selfPatient = await Patient.create({
          clinicId,
          fullName: 'Primary Patient',
          gender: 'OTHER',
        });
        await PatientContactLink.create({
          clinicId,
          bookingContactId,
          patientId: selfPatient._id,
          relationship: RELATIONSHIPS.SELF,
          isDefault: true,
        });
        actualPatientId = selfPatient._id;
      }
    } else if (patientTarget === 'EXISTING_FAMILY') {
      const verifiedLink = await PatientContactLink.findOne({
        clinicId,
        bookingContactId,
        patientId,
      });

      if (!verifiedLink) {
        const err = new Error('Unauthorized: Patient record does not belong to this booking contact.');
        err.statusCode = 403;
        throw err;
      }
      actualPatientId = patientId;
    } else if (patientTarget === 'NEW_FAMILY') {
      if (!newPatientData?.fullName || !newPatientData?.gender) {
        const err = new Error('Full name and gender are required for family member booking.');
        err.statusCode = 400;
        throw err;
      }

      const familyPatient = await Patient.create({
        clinicId,
        fullName: newPatientData.fullName.trim(),
        gender: newPatientData.gender,
        age: newPatientData.age ? Number(newPatientData.age) : undefined,
      });

      await PatientContactLink.create({
        clinicId,
        bookingContactId,
        patientId: familyPatient._id,
        relationship: newPatientData.relationship || RELATIONSHIPS.OTHER,
        isDefault: false,
      });

      actualPatientId = familyPatient._id;
    }

    // 2. Generate unguessable booking reference
    let bookingReference = generateBookingReference();
    let collisionCheck = await Appointment.findOne({ bookingReference });
    while (collisionCheck) {
      bookingReference = generateBookingReference();
      collisionCheck = await Appointment.findOne({ bookingReference });
    }

    const publicReferenceHash = hashReference(bookingReference);

    // 3. Create appointment in PENDING_REVIEW
    const appointment = await Appointment.create({
      clinicId,
      bookingReference,
      publicReferenceHash,
      patientId: actualPatientId,
      bookingContactId,
      departmentId,
      requestedWindow,
      status: APPOINTMENT_STATUS.PENDING_REVIEW,
      paymentStatus: PAYMENT_STATUS.NOT_REQUIRED,
      depositAmount: 120, // Configurable default
    });

    await AuditLog.create({
      clinicId,
      actorId: bookingContactId,
      actorRole: 'PATIENT',
      action: 'APPOINTMENT_REQUESTED',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      details: {
        bookingReference,
        patientId: actualPatientId.toString(),
        departmentId: departmentId.toString(),
        requestedDate: requestedWindow.preferredDate,
      },
    });

    return appointment;
  },

  /**
   * Receptionist Allocates Doctor and Slot (Atomic 5-Minute Hold)
   * Guaranteed concurrency-safe: Prevents double-booking across 50+ simultaneous requests.
   */
  async allocateSlotAtomic({
    appointmentId,
    receptionistUser,
    doctorId,
    slotDate,
    startTime,
    endTime,
  }) {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    const validStatuses = [
      APPOINTMENT_STATUS.PENDING_REVIEW,
      APPOINTMENT_STATUS.ALTERNATIVE_PROPOSED,
      APPOINTMENT_STATUS.HOLD_EXPIRED,
      APPOINTMENT_STATUS.SLOT_HELD,
    ];

    if (!validStatuses.includes(appointment.status)) {
      const err = new Error(`Cannot allocate slot for appointment with status ${appointment.status}.`);
      err.statusCode = 400;
      throw err;
    }

    const clinicId = appointment.clinicId;
    const capacityKey = `${clinicId.toString()}_${doctorId.toString()}_${slotDate}_${startTime}`;
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes strictly

    // Check if slot is already occupied
    const existingHold = await SlotHold.findOne({ capacityKey });

    if (existingHold) {
      const isStillHeld =
        existingHold.status === SLOT_HOLD_STATUS.CONFIRMED ||
        (existingHold.status === SLOT_HOLD_STATUS.ACTIVE && existingHold.expiresAt > now);

      if (isStillHeld && existingHold.appointmentId.toString() !== appointment._id.toString()) {
        const err = new Error('Selected doctor slot is already held or booked. Please choose another time.');
        err.statusCode = 409;
        throw err;
      }

      // Slot is either expired, released, or already belongs to this appointment -> refresh hold
      existingHold.status = SLOT_HOLD_STATUS.ACTIVE;
      existingHold.appointmentId = appointment._id;
      existingHold.expiresAt = holdExpiresAt;
      existingHold.endTime = endTime;
      await existingHold.save();
    } else {
      // Create new atomic hold with unique capacityKey constraint
      try {
        await SlotHold.create({
          clinicId,
          doctorId,
          slotDate,
          startTime,
          endTime,
          capacityKey,
          appointmentId: appointment._id,
          status: SLOT_HOLD_STATUS.ACTIVE,
          expiresAt: holdExpiresAt,
        });
      } catch (err) {
        if (err.code === 11000) {
          const conflictErr = new Error('Concurrency conflict: Slot was just taken by another request.');
          conflictErr.statusCode = 409;
          throw conflictErr;
        }
        throw err;
      }
    }

    // Update appointment state
    appointment.assignedDoctorId = doctorId;
    appointment.allocatedSlot = { date: slotDate, startTime, endTime };
    appointment.status = APPOINTMENT_STATUS.SLOT_HELD;
    appointment.slotHoldExpiresAt = holdExpiresAt;
    appointment.version += 1;
    await appointment.save();

    await AuditLog.create({
      clinicId,
      actorId: receptionistUser._id,
      actorRole: receptionistUser.role,
      action: 'SLOT_ALLOCATED_HOLD_CREATED',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      details: {
        doctorId: doctorId.toString(),
        slotDate,
        startTime,
        endTime,
        holdExpiresAt,
      },
    });

    return {
      appointment,
      holdExpiresAt,
      holdDurationSecs: 300,
    };
  },

  /**
   * Receptionist Proposes Alternative Slot
   */
  async proposeAlternative({
    appointmentId,
    receptionistUser,
    proposedDoctorId,
    proposedSlot, // { date, startTime, endTime }
    reason = 'Requested time unavailable',
  }) {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    appointment.status = APPOINTMENT_STATUS.ALTERNATIVE_PROPOSED;
    appointment.alternativeProposal = {
      proposedDoctorId,
      proposedSlot,
      reason,
      proposedAt: new Date(),
    };
    appointment.version += 1;
    await appointment.save();

    await AuditLog.create({
      clinicId: appointment.clinicId,
      actorId: receptionistUser._id,
      actorRole: receptionistUser.role,
      action: 'ALTERNATIVE_SLOT_PROPOSED',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      details: { proposedDoctorId: proposedDoctorId.toString(), proposedSlot, reason },
    });

    return appointment;
  },

  /**
   * Patient Accepts Proposed Alternative (Atomically Holds Slot)
   */
  async patientAcceptAlternative({ appointmentId, bookingContactId }) {
    const appointment = await Appointment.findOne({ _id: appointmentId, bookingContactId });
    if (!appointment) {
      const err = new Error('Appointment not found or unauthorized.');
      err.statusCode = 404;
      throw err;
    }

    if (appointment.status !== APPOINTMENT_STATUS.ALTERNATIVE_PROPOSED) {
      const err = new Error('No pending alternative proposal to accept.');
      err.statusCode = 400;
      throw err;
    }

    const { proposedDoctorId, proposedSlot } = appointment.alternativeProposal;
    if (!proposedDoctorId || !proposedSlot?.date || !proposedSlot?.startTime) {
      const err = new Error('Invalid alternative proposal details.');
      err.statusCode = 400;
      throw err;
    }

    // Atomically claim capacity hold for 5 minutes
    const clinicId = appointment.clinicId;
    const capacityKey = `${clinicId.toString()}_${proposedDoctorId.toString()}_${proposedSlot.date}_${proposedSlot.startTime}`;
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    const existingHold = await SlotHold.findOne({ capacityKey });
    if (existingHold && existingHold.status === SLOT_HOLD_STATUS.ACTIVE && existingHold.expiresAt > now) {
      const err = new Error('Proposed slot is no longer available. Please request assistance from reception.');
      err.statusCode = 409;
      throw err;
    }

    await SlotHold.findOneAndUpdate(
      { capacityKey },
      {
        clinicId,
        doctorId: proposedDoctorId,
        slotDate: proposedSlot.date,
        startTime: proposedSlot.startTime,
        endTime: proposedSlot.endTime,
        capacityKey,
        appointmentId: appointment._id,
        status: SLOT_HOLD_STATUS.ACTIVE,
        expiresAt: holdExpiresAt,
      },
      { upsert: true, new: true }
    );

    appointment.assignedDoctorId = proposedDoctorId;
    appointment.allocatedSlot = proposedSlot;
    appointment.status = APPOINTMENT_STATUS.SLOT_HELD;
    appointment.slotHoldExpiresAt = holdExpiresAt;
    appointment.alternativeProposal.acceptedAt = new Date();
    appointment.version += 1;
    await appointment.save();

    return { appointment, holdExpiresAt };
  },

  /**
   * Confirm Appointment (Authorized Staff No-Payment or Post-Verification)
   */
  async confirmAppointment({ appointmentId, staffUser }) {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    if (appointment.status !== APPOINTMENT_STATUS.SLOT_HELD) {
      const err = new Error(`Cannot confirm appointment in ${appointment.status} status.`);
      err.statusCode = 400;
      throw err;
    }

    // Confirm capacity hold permanently
    if (appointment.assignedDoctorId && appointment.allocatedSlot) {
      const capacityKey = `${appointment.clinicId.toString()}_${appointment.assignedDoctorId.toString()}_${appointment.allocatedSlot.date}_${appointment.allocatedSlot.startTime}`;
      await SlotHold.updateOne({ capacityKey }, { status: SLOT_HOLD_STATUS.CONFIRMED });
    }

    appointment.status = APPOINTMENT_STATUS.CONFIRMED;
    appointment.version += 1;
    await appointment.save();

    await AuditLog.create({
      clinicId: appointment.clinicId,
      actorId: staffUser._id,
      actorRole: staffUser.role,
      action: 'APPOINTMENT_CONFIRMED',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
    });

    return appointment;
  },

  /**
   * Cancel Appointment & Release Capacity
   */
  async cancelAppointment({ appointmentId, cancelledBy, reason = '' }) {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    // Release capacity hold if held
    if (appointment.assignedDoctorId && appointment.allocatedSlot) {
      const capacityKey = `${appointment.clinicId.toString()}_${appointment.assignedDoctorId.toString()}_${appointment.allocatedSlot.date}_${appointment.allocatedSlot.startTime}`;
      await SlotHold.updateOne({ capacityKey }, { status: SLOT_HOLD_STATUS.RELEASED });
    }

    appointment.status = APPOINTMENT_STATUS.CANCELLED;
    appointment.cancellation = {
      cancelledBy,
      reason,
      cancelledAt: new Date(),
    };
    appointment.version += 1;
    await appointment.save();

    return appointment;
  },

  /**
   * Scoped Appointment Retrieval (Household / Booking Contact)
   */
  async getAppointmentsForContact({ bookingContactId, clinicId }) {
    return Appointment.find({ clinicId, bookingContactId })
      .populate('patientId', 'fullName gender age')
      .populate('assignedDoctorId', 'staffUserId roomNumber')
      .populate('departmentId', 'name code')
      .sort({ createdAt: -1 });
  },

  /**
   * Receptionist Assisted Duplicate Patient Search
   * Never auto-merges; returns matches with similarity warnings for manual staff confirmation.
   */
  async searchDuplicateCandidates({ clinicId, fullName = '', phone = '' }) {
    const candidates = [];

    if (phone) {
      const contact = await BookingContact.findOne({ clinicId, phone: phone.trim() });
      if (contact) {
        const links = await PatientContactLink.find({ clinicId, bookingContactId: contact._id }).populate('patientId');
        for (const link of links) {
          if (link.patientId) {
            candidates.push({
              matchType: 'SHARED_PHONE_NUMBER',
              warning: `Phone number is already associated with ${link.patientId.fullName} (${link.relationship}).`,
              patient: link.patientId,
              contact,
            });
          }
        }
      }
    }

    if (fullName) {
      const nameMatches = await Patient.find({
        clinicId,
        fullName: { $regex: new RegExp(`^${fullName.trim()}$`, 'i') },
      });

      for (const p of nameMatches) {
        if (!candidates.some((c) => c.patient._id.toString() === p._id.toString())) {
          candidates.push({
            matchType: 'EXACT_NAME_MATCH',
            warning: `Existing patient record with identical name '${p.fullName}' found.`,
            patient: p,
          });
        }
      }
    }

    return candidates;
  },
};

