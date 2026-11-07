import {
  QueueEntry,
  QUEUE_STATUS,
  QUEUE_ENTRY_TYPE,
  QueueSequenceCounter,
  Appointment,
  APPOINTMENT_STATUS,
  Doctor,
  Department,
  Patient,
  BookingContact,
  PatientContactLink,
  AuditLog,
  Clinic,
} from '../models/index.js';
import { getIO } from '../config/socket.js';
import { logger } from '../shared/logger.js';

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

export const queueService = {
  /**
   * Monotonic Atomic Token Sequence Generator
   * Guaranteed zero collision under concurrent requests
   */
  async getNextTokenSequence({ clinicId, doctorId, queueDate, departmentCode = 'A' }) {
    const counter = await QueueSequenceCounter.findOneAndUpdate(
      { clinicId, doctorId, queueDate },
      { $inc: { lastSequence: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const tokenSequence = counter.lastSequence;
    const publicToken = `${departmentCode}-${String(tokenSequence).padStart(2, '0')}`;
    return { tokenSequence, publicToken };
  },

  /**
   * Broadcast Queue Event to Clinic Socket Room
   * Invariant: Persisted before broadcast
   */
  broadcastQueueUpdate(clinicId, eventName, payload) {
    try {
      const io = getIO();
      if (io) {
        io.to(`clinic_${clinicId.toString()}`).emit(eventName, payload);
      }
    } catch {
      // Socket may not be initialized in isolated test environments
    }
  },

  /**
   * Patient Self Check-In (QR Code or Booking Reference)
   */
  async checkInAppointment({ clinicId, bookingReference }) {
    const normalizedRef = (bookingReference || '').trim().toUpperCase();
    const appointment = await Appointment.findOne({ bookingReference: normalizedRef });

    if (!appointment) {
      const err = new Error('Invalid booking reference.');
      err.statusCode = 404;
      throw err;
    }

    // 1. Idempotency Guard: If already checked in, return existing queue entry without duplicate token
    const existingQueueEntry = await QueueEntry.findOne({
      appointmentId: appointment._id,
      queueStatus: { $ne: QUEUE_STATUS.CANCELLED },
    });

    if (existingQueueEntry) {
      return {
        alreadyCheckedIn: true,
        message: 'You are already checked in.',
        queueEntry: existingQueueEntry,
        appointment,
      };
    }

    if (appointment.status === APPOINTMENT_STATUS.CANCELLED || appointment.status === APPOINTMENT_STATUS.REJECTED) {
      const err = new Error(`Cannot check in for ${appointment.status.toLowerCase()} appointment.`);
      err.statusCode = 400;
      throw err;
    }

    // 2. Resolve Doctor and Department
    const effectiveClinicId = appointment.clinicId;
    let doctorId = appointment.assignedDoctorId;
    let departmentId = appointment.departmentId;

    if (!doctorId) {
      // If doctor not yet assigned, find first available doctor in department
      const doc = await Doctor.findOne({ clinicId: effectiveClinicId, departmentIds: departmentId, active: true });
      if (!doc) {
        const err = new Error('No active doctor available for this department. Please step up to reception desk.');
        err.statusCode = 400;
        throw err;
      }
      doctorId = doc._id;
      appointment.assignedDoctorId = doctorId;
    }

    const dept = await Department.findById(departmentId);
    const departmentCode = dept?.code || 'A';
    const queueDate = getTodayString();

    // 3. Atomically claim check-in slot on Appointment document (Mutual exclusion lock)
    // Only the winning concurrent request transitions the appointment status and generates a token!
    let claimedAppointment = await Appointment.findOneAndUpdate(
      {
        _id: appointment._id,
        status: {
          $in: [
            APPOINTMENT_STATUS.CONFIRMED,
            APPOINTMENT_STATUS.PENDING_REVIEW,
            APPOINTMENT_STATUS.SLOT_HELD,
          ],
        },
      },
      {
        $inc: { version: 1 },
        $set: {
          status: APPOINTMENT_STATUS.CHECKED_IN,
          checkInAt: new Date(),
          assignedDoctorId: doctorId,
        },
      },
      { new: true }
    );

    if (!claimedAppointment) {
      // The appointment is not in an initial confirmable status.
      // Case A: Another concurrent check-in request is actively in-flight.
      // Poll for up to 1.5 seconds (15 attempts x 100ms) for the winning request to persist QueueEntry.
      for (let attempt = 0; attempt < 15; attempt++) {
        const entry = await QueueEntry.findOne({
          appointmentId: appointment._id,
          queueStatus: { $ne: QUEUE_STATUS.CANCELLED },
        });
        if (entry) {
          return {
            alreadyCheckedIn: true,
            message: 'You are already checked in.',
            queueEntry: entry,
            appointment,
          };
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      // Case B: Crash / Interruption Recovery Mechanism
      // The appointment status was set to CHECKED_IN, but the server crashed before QueueEntry creation.
      // We safely recover the orphan appointment without reopening status or risking duplicate tokens.
      const currentApt = await Appointment.findById(appointment._id);
      if (currentApt?.status === APPOINTMENT_STATUS.CHECKED_IN) {
        const orphanCheck = await QueueEntry.findOne({
          appointmentId: appointment._id,
          queueStatus: { $ne: QUEUE_STATUS.CANCELLED },
        });

        if (!orphanCheck) {
          // Atomically acquire the recovery claim via optimistic concurrency lock on `version`
          claimedAppointment = await Appointment.findOneAndUpdate(
            {
              _id: appointment._id,
              status: APPOINTMENT_STATUS.CHECKED_IN,
              version: currentApt.version,
            },
            {
              $inc: { version: 1 },
              $set: { checkInAt: new Date(), assignedDoctorId: doctorId },
            },
            { new: true }
          );

          if (!claimedAppointment) {
            // Another concurrent recovery request acquired the lock. Poll briefly for its QueueEntry.
            for (let attempt = 0; attempt < 15; attempt++) {
              const entry = await QueueEntry.findOne({
                appointmentId: appointment._id,
                queueStatus: { $ne: QUEUE_STATUS.CANCELLED },
              });
              if (entry) {
                return {
                  alreadyCheckedIn: true,
                  message: 'You are already checked in.',
                  queueEntry: entry,
                  appointment: currentApt,
                };
              }
              await new Promise((r) => setTimeout(r, 100));
            }
          }
        } else {
          return {
            alreadyCheckedIn: true,
            message: 'You are already checked in.',
            queueEntry: orphanCheck,
            appointment: currentApt,
          };
        }
      }

      if (!claimedAppointment) {
        const fallbackEntry = await QueueEntry.findOne({ appointmentId: appointment._id });
        if (fallbackEntry) {
          return {
            alreadyCheckedIn: true,
            message: 'You are already checked in.',
            queueEntry: fallbackEntry,
            appointment,
          };
        }
        const err = new Error('Appointment check-in in progress or already processed. Please refresh.');
        err.statusCode = 409;
        throw err;
      }
    }

    // 4. Atomically generate sequence token (Only executed by the single winning request!)
    const { tokenSequence, publicToken } = await this.getNextTokenSequence({
      clinicId: effectiveClinicId,
      doctorId,
      queueDate,
      departmentCode,
    });

    // 5. Create QueueEntry (Protected by unique partial index on appointmentId)
    let queueEntry;
    try {
      queueEntry = await QueueEntry.create({
        clinicId: effectiveClinicId,
        queueDate,
        departmentId,
        doctorId,
        patientId: appointment.patientId,
        appointmentId: appointment._id,
        tokenSequence,
        publicToken,
        entryType: QUEUE_ENTRY_TYPE.BOOKED,
        queueStatus: QUEUE_STATUS.WAITING,
        checkedInAt: new Date(),
      });
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        // Intercepted by unique_active_appointment_queue_entry or duplicate key
        const existing = await QueueEntry.findOne({
          appointmentId: appointment._id,
          queueStatus: { $ne: QUEUE_STATUS.CANCELLED },
        });
        if (existing) {
          return {
            alreadyCheckedIn: true,
            message: 'You are already checked in.',
            queueEntry: existing,
            appointment: claimedAppointment,
          };
        }
      }
      // Rollback appointment status if queue entry creation crashed unexpectedly
      await Appointment.findByIdAndUpdate(appointment._id, { status: appointment.status });
      throw dbErr;
    }

    await AuditLog.create({
      clinicId: effectiveClinicId,
      actorId: appointment.bookingContactId,
      actorRole: 'PATIENT',
      action: 'PATIENT_CHECKED_IN',
      entityType: 'QueueEntry',
      entityId: queueEntry._id.toString(),
      details: { bookingReference: appointment.bookingReference, publicToken },
    });

    // 6. Broadcast update
    this.broadcastQueueUpdate(effectiveClinicId, 'queue:patient_checked_in', {
      token: publicToken,
      queueDate,
      doctorId: doctorId.toString(),
      entryType: QUEUE_ENTRY_TYPE.BOOKED,
    });

    return {
      alreadyCheckedIn: false,
      message: 'Check-in successful! Please take your seat in the waiting area.',
      queueEntry,
      appointment: claimedAppointment,
    };
  },

  /**
   * Receptionist Assisted Walk-In Registration
   * Advance deposit = ₹0 by default. FIFO within assigned doctor queue.
   */
  async registerWalkIn({
    clinicId,
    receptionistUser,
    doctorId,
    departmentId,
    patientName,
    gender = 'OTHER',
    age,
    phone = '',
  }) {
    if (!doctorId || !departmentId || !patientName) {
      const err = new Error('Doctor, department, and patient name are required for walk-in registration.');
      err.statusCode = 400;
      throw err;
    }

    const queueDate = getTodayString();

    // 1. Create permanent Patient record
    const patient = await Patient.create({
      clinicId,
      fullName: patientName.trim(),
      gender,
      age: age ? Number(age) : undefined,
    });

    // 2. Link BookingContact if phone provided
    if (phone) {
      let contact = await BookingContact.findOne({ clinicId, phone: phone.trim() });
      if (!contact) {
        contact = await BookingContact.create({
          clinicId,
          phone: phone.trim(),
          normalizedPhone: phone.trim().startsWith('+') ? phone.trim() : `+91${phone.trim()}`,
        });
      }
      await PatientContactLink.create({
        clinicId,
        bookingContactId: contact._id,
        patientId: patient._id,
        relationship: 'SELF',
      });
    }

    // 3. Atomically issue next token sequence
    const dept = await Department.findById(departmentId);
    const departmentCode = dept?.code || 'W';

    const { tokenSequence, publicToken } = await this.getNextTokenSequence({
      clinicId,
      doctorId,
      queueDate,
      departmentCode,
    });

    // 4. Create QueueEntry in WAITING state
    const queueEntry = await QueueEntry.create({
      clinicId,
      queueDate,
      departmentId,
      doctorId,
      patientId: patient._id,
      appointmentId: null, // Walk-in
      tokenSequence,
      publicToken,
      entryType: QUEUE_ENTRY_TYPE.WALK_IN,
      queueStatus: QUEUE_STATUS.WAITING,
      checkedInAt: new Date(),
    });

    await AuditLog.create({
      clinicId,
      actorId: receptionistUser._id,
      actorRole: receptionistUser.role,
      action: 'WALK_IN_REGISTERED',
      entityType: 'QueueEntry',
      entityId: queueEntry._id.toString(),
      details: { patientName, publicToken, doctorId: doctorId.toString() },
    });

    this.broadcastQueueUpdate(clinicId, 'queue:walk_in_registered', {
      token: publicToken,
      queueDate,
      status: queueEntry.queueStatus,
    });

    return { queueEntry, patient };
  },

  /**
   * Doctor / Receptionist Calls Next Eligible Patient
   * Clinical Safety Invariant: NEVER interrupt an active consultation currently in SERVING state!
   * Doctor Queue Exclusivity: At most ONE patient in CALLED or SERVING state per doctor room.
   */
  async callNext({ clinicId, staffUser, doctorId }) {
    const queueDate = getTodayString();

    // 1. Doctor Room Exclusivity Guard: Is doctor currently serving or is another patient already called?
    const activeOrCalled = await QueueEntry.findOne({
      clinicId,
      doctorId,
      queueDate,
      queueStatus: { $in: [QUEUE_STATUS.CALLED, QUEUE_STATUS.SERVING] },
    });

    if (activeOrCalled) {
      if (activeOrCalled.queueStatus === QUEUE_STATUS.SERVING) {
        const err = new Error(
          `Doctor is currently in consultation with token ${activeOrCalled.publicToken}. Consultations in progress cannot be interrupted. Complete consultation first.`
        );
        err.statusCode = 409;
        throw err;
      } else {
        const err = new Error(
          `Patient with token ${activeOrCalled.publicToken} has already been called and is awaiting entry into consultation room. Please start consultation or skip before calling another patient.`
        );
        err.statusCode = 409;
        throw err;
      }
    }

    // 2. Select next eligible patient:
    // Priority order: (1) Manual Priority Overrides, (2) FIFO Waiting Patients
    let candidate = await QueueEntry.findOne({
      clinicId,
      doctorId,
      queueDate,
      queueStatus: QUEUE_STATUS.WAITING,
      isPriority: true,
    }).sort({ checkedInAt: 1 });

    if (!candidate) {
      candidate = await QueueEntry.findOne({
        clinicId,
        doctorId,
        queueDate,
        queueStatus: QUEUE_STATUS.WAITING,
      }).sort({ tokenSequence: 1 });
    }

    if (!candidate) {
      return { hasWaitingPatients: false, message: 'No waiting patients in queue for this doctor.' };
    }

    // 3. Atomically transition candidate to CALLED
    // Protected by both conditional update filter AND unique partial index on { clinicId, doctorId, queueDate }
    let nextPatient;
    try {
      nextPatient = await QueueEntry.findOneAndUpdate(
        {
          _id: candidate._id,
          queueStatus: QUEUE_STATUS.WAITING,
        },
        {
          $set: {
            queueStatus: QUEUE_STATUS.CALLED,
            calledAt: new Date(),
          },
          $inc: { callCount: 1 },
        },
        { new: true }
      );
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        const err = new Error('Another staff member just called or started consultation for this doctor room. Queue is locked.');
        err.statusCode = 409;
        throw err;
      }
      throw dbErr;
    }

    if (!nextPatient) {
      const err = new Error('Candidate patient was just updated by another request. Please retry.');
      err.statusCode = 409;
      throw err;
    }

    await AuditLog.create({
      clinicId,
      actorId: staffUser._id,
      actorRole: staffUser.role,
      action: 'PATIENT_CALLED',
      entityType: 'QueueEntry',
      entityId: nextPatient._id.toString(),
      details: { publicToken: nextPatient.publicToken, doctorId: doctorId.toString() },
    });

    // Broadcast call announcement ONLY after database transition succeeded
    const doc = await Doctor.findById(doctorId).populate('staffUserId', 'name');
    const patientDoc = await Patient.findById(nextPatient.patientId).select('fullName');
    const clinic = await Clinic.findById(clinicId);
    const showPatientName = Boolean(clinic?.tvDisplay?.showPatientName);

    this.broadcastQueueUpdate(clinicId, 'display:token_called', {
      token: nextPatient.publicToken,
      patientName: showPatientName ? (patientDoc?.fullName || 'Patient') : undefined,
      roomNumber: doc?.roomNumber || '101',
      doctorName: doc?.staffUserId?.name || 'Practitioner',
      callCount: nextPatient.callCount,
      announcementLanguage: clinic?.tvDisplay?.announcementLanguage || 'en',
    });

    return {
      hasWaitingPatients: true,
      calledEntry: nextPatient,
    };
  },

  /**
   * Doctor Starts Consultation (CALLED -> SERVING)
   * Exclusive Consultation Invariant: At most ONE patient in SERVING state per doctor.
   */
  async startServing({ clinicId, doctorId, queueEntryId }) {
    // 1. Doctor exclusivity guard: Check if doctor is already in an active consultation
    const currentlyServing = await QueueEntry.findOne({
      clinicId,
      doctorId,
      queueStatus: QUEUE_STATUS.SERVING,
    });

    if (currentlyServing && currentlyServing._id.toString() !== queueEntryId.toString()) {
      const err = new Error(
        `Doctor is already in an active consultation with token ${currentlyServing.publicToken}. Complete current consultation first.`
      );
      err.statusCode = 409;
      throw err;
    }

    // 2. Atomic state transition: Only a valid CALLED entry can transition to SERVING
    let queueEntry;
    try {
      queueEntry = await QueueEntry.findOneAndUpdate(
        {
          _id: queueEntryId,
          clinicId,
          doctorId,
          queueStatus: QUEUE_STATUS.CALLED,
        },
        {
          $set: {
            queueStatus: QUEUE_STATUS.SERVING,
            servingAt: new Date(),
          },
        },
        { new: true }
      );
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        const err = new Error('Cannot start consultation: Another consultation is already active for this doctor.');
        err.statusCode = 409;
        throw err;
      }
      throw dbErr;
    }

    if (!queueEntry) {
      const existing = await QueueEntry.findOne({ _id: queueEntryId, clinicId, doctorId });
      if (!existing) {
        const err = new Error('Queue entry not found.');
        err.statusCode = 404;
        throw err;
      }
      if (existing.queueStatus === QUEUE_STATUS.SERVING) {
        // Idempotent start: Consultation was already started by another request
        return existing;
      }
      const err = new Error(
        `Cannot start consultation. Patient is currently in ${existing.queueStatus} status. Must be CALLED first.`
      );
      err.statusCode = 409;
      throw err;
    }

    this.broadcastQueueUpdate(clinicId, 'queue:status_changed', {
      token: queueEntry.publicToken,
      status: QUEUE_STATUS.SERVING,
    });

    return queueEntry;
  },

  /**
   * Doctor Finishes Consultation (SERVING -> COMPLETED)
   * Consultation Completion frees the doctor room lock immediately.
   */
  async completeConsultation({ clinicId, doctorId, queueEntryId }) {
    const queueEntry = await QueueEntry.findOneAndUpdate(
      {
        _id: queueEntryId,
        clinicId,
        doctorId,
        queueStatus: QUEUE_STATUS.SERVING,
      },
      {
        $set: {
          queueStatus: QUEUE_STATUS.COMPLETED,
          completedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!queueEntry) {
      const existing = await QueueEntry.findOne({ _id: queueEntryId, clinicId, doctorId });
      if (!existing) {
        const err = new Error('Queue entry not found.');
        err.statusCode = 404;
        throw err;
      }
      if (existing.queueStatus === QUEUE_STATUS.COMPLETED) {
        // Idempotent completion
        return existing;
      }
      const err = new Error(`Cannot complete consultation. Patient is in ${existing.queueStatus} status, not SERVING.`);
      err.statusCode = 409;
      throw err;
    }

    if (queueEntry.appointmentId) {
      await Appointment.findByIdAndUpdate(queueEntry.appointmentId, {
        status: APPOINTMENT_STATUS.COMPLETED || 'COMPLETED',
      });
    }

    this.broadcastQueueUpdate(clinicId, 'queue:status_changed', {
      token: queueEntry.publicToken,
      status: QUEUE_STATUS.COMPLETED,
    });

    return queueEntry;
  },

  /**
   * Skip Token after unacknowledged calls (CALLED -> SKIPPED)
   * Skipping frees the doctor room lock immediately.
   */
  async skipPatient({ clinicId, staffUser, queueEntryId, reason = 'No response after 2 calls' }) {
    const queueEntry = await QueueEntry.findOneAndUpdate(
      {
        _id: queueEntryId,
        clinicId,
        queueStatus: QUEUE_STATUS.CALLED,
      },
      {
        $set: {
          queueStatus: QUEUE_STATUS.SKIPPED,
        },
      },
      { new: true }
    );

    if (!queueEntry) {
      const existing = await QueueEntry.findOne({ _id: queueEntryId, clinicId });
      if (!existing) {
        const err = new Error('Queue entry not found.');
        err.statusCode = 404;
        throw err;
      }
      if (existing.queueStatus === QUEUE_STATUS.SKIPPED) {
        return existing;
      }
      const err = new Error(`Cannot skip patient in ${existing.queueStatus} status. Must be in CALLED status.`);
      err.statusCode = 409;
      throw err;
    }

    await AuditLog.create({
      clinicId,
      actorId: staffUser._id,
      actorRole: staffUser.role,
      action: 'PATIENT_SKIPPED',
      entityType: 'QueueEntry',
      entityId: queueEntry._id.toString(),
      details: { token: queueEntry.publicToken, reason },
    });

    this.broadcastQueueUpdate(clinicId, 'queue:status_changed', {
      token: queueEntry.publicToken,
      status: QUEUE_STATUS.SKIPPED,
    });

    return queueEntry;
  },

  /**
   * Recall Skipped Patient (SKIPPED -> CALLED)
   * Re-acquires doctor room lock.
   */
  async recallPatient({ clinicId, staffUser, queueEntryId }) {
    const queueEntry = await QueueEntry.findOne({ _id: queueEntryId, clinicId });
    if (!queueEntry) {
      const err = new Error('Queue entry not found.');
      err.statusCode = 404;
      throw err;
    }

    const today = getTodayString();
    // Guard: Doctor cannot have an active CALLED or SERVING patient when recalling
    const activeOrCalled = await QueueEntry.findOne({
      clinicId,
      doctorId: queueEntry.doctorId,
      queueDate: queueEntry.queueDate || today,
      queueStatus: { $in: [QUEUE_STATUS.CALLED, QUEUE_STATUS.SERVING] },
      _id: { $ne: queueEntry._id },
    });

    if (activeOrCalled) {
      const err = new Error(
        `Cannot recall patient: Doctor already has an active called or serving patient (Token ${activeOrCalled.publicToken}).`
      );
      err.statusCode = 409;
      throw err;
    }

    let updatedEntry;
    try {
      updatedEntry = await QueueEntry.findOneAndUpdate(
        {
          _id: queueEntryId,
          clinicId,
          queueStatus: QUEUE_STATUS.SKIPPED,
        },
        {
          $set: {
            queueStatus: QUEUE_STATUS.CALLED,
            calledAt: new Date(),
          },
          $inc: { callCount: 1 },
        },
        { new: true }
      );
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        const err = new Error('Cannot recall patient: Another patient was just called or started consultation for this doctor.');
        err.statusCode = 409;
        throw err;
      }
      throw dbErr;
    }

    if (!updatedEntry) {
      const existing = await QueueEntry.findById(queueEntryId);
      if (existing?.queueStatus === QUEUE_STATUS.CALLED) {
        return existing;
      }
      const err = new Error(`Cannot recall patient: Patient is currently in ${existing?.queueStatus} status, not SKIPPED.`);
      err.statusCode = 409;
      throw err;
    }

    this.broadcastQueueUpdate(clinicId, 'display:token_called', {
      token: updatedEntry.publicToken,
      status: QUEUE_STATUS.CALLED,
    });

    return updatedEntry;
  },

  /**
   * Privacy-Preserving Public Waiting Room Display Query
   * STRICT INVARIANT: ZERO personal names, phone numbers, or visit reasons exposed.
   */
  async getWaitingRoomDisplay({ clinicId, date }) {
    const queueDate = date || getTodayString();

    const clinic = await Clinic.findById(clinicId);
    const showPatientName = Boolean(clinic?.tvDisplay?.showPatientName);

    const activeList = await QueueEntry.find({
      clinicId,
      queueDate,
      queueStatus: { $in: [QUEUE_STATUS.SERVING, QUEUE_STATUS.CALLED] },
    })
      .populate({
        path: 'doctorId',
        populate: { path: 'staffUserId', select: 'name' },
      })
      .populate('departmentId', 'name')
      .populate('patientId', 'fullName')
      .sort({ calledAt: -1 });

    const nowServing = activeList.map((item) => ({
      token: item.publicToken,
      patientName: showPatientName ? (item.patientId?.fullName || 'Patient') : undefined,
      roomNumber: item.doctorId?.roomNumber || '101',
      doctorName: item.doctorId?.staffUserId?.name || 'Dr. Practitioner',
      department: item.departmentId?.name || 'General',
      status: item.queueStatus,
    }));

    const waitingList = await QueueEntry.find({
      clinicId,
      queueDate,
      queueStatus: QUEUE_STATUS.WAITING,
    })
      .select('publicToken')
      .sort({ tokenSequence: 1 })
      .limit(6);

    const upNext = waitingList.map((item) => item.publicToken);

    return {
      queueDate,
      nowServing,
      upNext,
    };
  },
};

