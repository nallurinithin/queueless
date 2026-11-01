import mongoose from 'mongoose';

export const APPOINTMENT_STATUS = {
  PENDING_REVIEW: 'PENDING_REVIEW',
  ALTERNATIVE_PROPOSED: 'ALTERNATIVE_PROPOSED',
  SLOT_HELD: 'SLOT_HELD',
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  LATE: 'LATE',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  HOLD_EXPIRED: 'HOLD_EXPIRED',
  NO_SHOW: 'NO_SHOW',
};

export const PAYMENT_STATUS = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REFUND_PENDING: 'REFUND_PENDING',
  REFUNDED: 'REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED',
  RECONCILIATION_REQUIRED: 'RECONCILIATION_REQUIRED',
};

const appointmentSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    publicReferenceHash: {
      type: String,
      required: true,
      index: true,
    },
    // Decoupled Patient Identity (the actual human being receiving medical care)
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    // Verified Booking Contact (the communication and payment anchor)
    bookingContactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingContact',
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    assignedDoctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      default: null,
      index: true,
    },
    requestedWindow: {
      preferredDate: { type: String, required: true }, // 'YYYY-MM-DD'
      preferredTimeSlot: { type: String, default: 'Morning' }, // 'Morning' | 'Evening' | custom
      reasonCategory: { type: String, default: 'General Consultation' },
      notes: { type: String, default: '' },
    },
    allocatedSlot: {
      date: { type: String, default: null }, // 'YYYY-MM-DD'
      startTime: { type: String, default: null }, // '10:15'
      endTime: { type: String, default: null }, // '10:30'
    },
    status: {
      type: String,
      enum: Object.values(APPOINTMENT_STATUS),
      default: APPOINTMENT_STATUS.PENDING_REVIEW,
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.NOT_REQUIRED,
      index: true,
    },
    slotHoldExpiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    depositAmount: {
      type: Number,
      default: 0,
    },
    checkInAt: {
      type: Date,
      default: null,
    },
    alternativeProposal: {
      proposedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
      proposedSlot: {
        date: { type: String, default: null },
        startTime: { type: String, default: null },
        endTime: { type: String, default: null },
      },
      reason: { type: String, default: '' },
      proposedAt: { type: Date, default: null },
      acceptedAt: { type: Date, default: null },
      rejectedAt: { type: Date, default: null },
    },
    cancellation: {
      cancelledBy: { type: String, default: null }, // 'PATIENT' | 'STAFF' | 'SYSTEM'
      reason: { type: String, default: '' },
      cancelledAt: { type: Date, default: null },
      refundOutcome: { type: String, default: null },
    },
    version: {
      type: Number,
      default: 1, // Optimistic concurrency version
    },
  },
  {
    timestamps: true,
  }
);

appointmentSchema.index({ clinicId: 1, status: 1 });
appointmentSchema.index({ clinicId: 1, assignedDoctorId: 1, 'allocatedSlot.date': 1 });
appointmentSchema.index({ clinicId: 1, bookingContactId: 1, createdAt: -1 });
appointmentSchema.index({ clinicId: 1, patientId: 1, createdAt: -1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);

