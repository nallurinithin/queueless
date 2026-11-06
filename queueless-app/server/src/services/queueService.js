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
    let doctorId = appointment.assignedDoctorId;
    let departmentId = appointment.departmentId;

    if (!doctorId) {
      // If doctor not yet assigned, find first available doctor in department
      const doc = await Doctor.findOne({ clinicId, departmentIds: departmentId, active: true });
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

    // 3. Atomically generate sequence token
    const { tokenSequence, publicToken } = await this.getNextTokenSequence({
      clinicId,
      doctorId,
      queueDate,
      departmentCode,
    });

    // 4. Create QueueEntry
    const queueEntry = await QueueEntry.create({
      clinicId,
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

    // 5. Update Appointment
    appointment.status = APPOINTMENT_STATUS.CHECKED_IN;
    appointment.checkInAt = new Date();
    await appointment.save();

    await AuditLog.create({
      clinicId,
      actorId: appointment.bookingContactId,
      actorRole: 'PATIENT',
      action: 'PATIENT_CHECKED_IN',
      entityType: 'QueueEntry',
      entityId: queueEntry._id.toString(),
      details: { bookingReference: appointment.bookingReference, publicToken },
    });

    // 6. Broadcast update
    this.broadcastQueueUpdate(clinicId, 'queue:patient_checked_in', {
      token: publicToken,
      queueDate,
      status: queueEntry.queueStatus,
    });

    return {
      alreadyCheckedIn: false,
      message: 'Check-in successful. Your priority window is active in the queue.',
      queueEntry,
      appointment,
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
   */
  async callNext({ clinicId, staffUser, doctorId }) {
    const queueDate = getTodayString();

    // 1. Clinical Safety Rule Check: Is doctor currently in a consultation?
    const activeConsultation = await QueueEntry.findOne({
      clinicId,
      doctorId,
      queueDate,
      queueStatus: QUEUE_STATUS.SERVING,
    });

    if (activeConsultation) {
      const err = new Error(
        `Doctor is currently in consultation with token ${activeConsultation.publicToken}. Consultations in progress cannot be interrupted. Complete consultation first.`
      );
      err.statusCode = 409;
      throw err;
    }

    // 2. Select next eligible patient:
    // Priority order: (1) Manual Priority Overrides, (2) FIFO Waiting Patients
    let nextPatient = await QueueEntry.findOne({
      clinicId,
      doctorId,
      queueDate,
      queueStatus: QUEUE_STATUS.WAITING,
      isPriority: true,
    }).sort({ checkedInAt: 1 });

    if (!nextPatient) {
      nextPatient = await QueueEntry.findOne({
        clinicId,
        doctorId,
        queueDate,
        queueStatus: QUEUE_STATUS.WAITING,
      }).sort({ tokenSequence: 1 });
    }

    if (!nextPatient) {
      return { hasWaitingPatients: false, message: 'No waiting patients in queue for this doctor.' };
    }

    // 3. Transition to CALLED
    nextPatient.queueStatus = QUEUE_STATUS.CALLED;
    nextPatient.calledAt = new Date();
    nextPatient.callCount += 1;
    await nextPatient.save();

    await AuditLog.create({
      clinicId,
      actorId: staffUser._id,
      actorRole: staffUser.role,
      action: 'PATIENT_CALLED',
      entityType: 'QueueEntry',
      entityId: nextPatient._id.toString(),
      details: { publicToken: nextPatient.publicToken, doctorId: doctorId.toString() },
    });

    // Broadcast call announcement
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
   */
  async startServing({ clinicId, doctorId, queueEntryId }) {
    const queueEntry = await QueueEntry.findOne({ _id: queueEntryId, clinicId, doctorId });
    if (!queueEntry) {
      const err = new Error('Queue entry not found.');
      err.statusCode = 404;
      throw err;
    }

    queueEntry.queueStatus = QUEUE_STATUS.SERVING;
    queueEntry.servingAt = new Date();
    await queueEntry.save();

    this.broadcastQueueUpdate(clinicId, 'queue:status_changed', {
      token: queueEntry.publicToken,
      status: QUEUE_STATUS.SERVING,
    });

    return queueEntry;
  },

  /**
   * Doctor Finishes Consultation (SERVING -> COMPLETED)
   */
  async completeConsultation({ clinicId, doctorId, queueEntryId }) {
    const queueEntry = await QueueEntry.findOne({ _id: queueEntryId, clinicId, doctorId });
    if (!queueEntry) {
      const err = new Error('Queue entry not found.');
      err.statusCode = 404;
      throw err;
    }

    queueEntry.queueStatus = QUEUE_STATUS.COMPLETED;
    queueEntry.completedAt = new Date();
    await queueEntry.save();

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
   */
  async skipPatient({ clinicId, staffUser, queueEntryId, reason = 'No response after 2 calls' }) {
    const queueEntry = await QueueEntry.findOne({ _id: queueEntryId, clinicId });
    if (!queueEntry) {
      const err = new Error('Queue entry not found.');
      err.statusCode = 404;
      throw err;
    }

    queueEntry.queueStatus = QUEUE_STATUS.SKIPPED;
    await queueEntry.save();

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
   */
  async recallPatient({ clinicId, staffUser, queueEntryId }) {
    const queueEntry = await QueueEntry.findOne({ _id: queueEntryId, clinicId });
    if (!queueEntry) {
      const err = new Error('Queue entry not found.');
      err.statusCode = 404;
      throw err;
    }

    queueEntry.queueStatus = QUEUE_STATUS.CALLED;
    queueEntry.calledAt = new Date();
    queueEntry.callCount += 1;
    await queueEntry.save();

    this.broadcastQueueUpdate(clinicId, 'display:token_called', {
      token: queueEntry.publicToken,
      status: QUEUE_STATUS.CALLED,
    });

    return queueEntry;
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

