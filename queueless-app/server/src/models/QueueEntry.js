import mongoose from 'mongoose';

export const QUEUE_STATUS = {
  REGISTERED: 'REGISTERED',
  WAITING: 'WAITING',
  CALLED: 'CALLED',
  SKIPPED: 'SKIPPED',
  SERVING: 'SERVING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const QUEUE_ENTRY_TYPE = {
  WALK_IN: 'WALK_IN',
  BOOKED: 'BOOKED',
};

const queueEntrySchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    queueDate: {
      type: String, // 'YYYY-MM-DD'
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      default: null,
      index: true,
    },
    tokenSequence: {
      type: Number,
      required: true,
    },
    publicToken: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    entryType: {
      type: String,
      enum: Object.values(QUEUE_ENTRY_TYPE),
      required: true,
    },
    queueStatus: {
      type: String,
      enum: Object.values(QUEUE_STATUS),
      default: QUEUE_STATUS.WAITING,
      index: true,
    },
    checkedInAt: {
      type: Date,
      default: Date.now,
    },
    calledAt: {
      type: Date,
      default: null,
    },
    callCount: {
      type: Number,
      default: 0,
    },
    servingAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    estimatedWaitMins: {
      type: Number,
      default: 15,
    },
    priorityReason: {
      type: String,
      default: '',
    },
    isPriority: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Atomic sequence uniqueness per clinic/doctor/date
queueEntrySchema.index({ clinicId: 1, doctorId: 1, queueDate: 1, tokenSequence: 1 }, { unique: true });
queueEntrySchema.index({ clinicId: 1, queueDate: 1, queueStatus: 1 });
queueEntrySchema.index({ clinicId: 1, doctorId: 1, queueDate: 1, queueStatus: 1 });

// Invariant 1: Doctor Room Exclusivity - At most ONE active patient in CALLED or SERVING status per doctor per date
queueEntrySchema.index(
  { clinicId: 1, doctorId: 1, queueDate: 1 },
  {
    name: 'unique_active_called_or_serving_per_doctor',
    unique: true,
    partialFilterExpression: { queueStatus: { $in: [QUEUE_STATUS.CALLED, QUEUE_STATUS.SERVING] } },
  }
);

// Invariant 2: Appointment Check-In Idempotency - At most ONE active queue entry per appointment
queueEntrySchema.index(
  { clinicId: 1, appointmentId: 1 },
  {
    name: 'unique_active_appointment_queue_entry',
    unique: true,
    partialFilterExpression: {
      appointmentId: { $type: 'objectId' },
      queueStatus: {
        $in: [
          QUEUE_STATUS.REGISTERED,
          QUEUE_STATUS.WAITING,
          QUEUE_STATUS.CALLED,
          QUEUE_STATUS.SERVING,
          QUEUE_STATUS.COMPLETED,
        ],
      },
    },
  }
);

export const QueueEntry = mongoose.model('QueueEntry', queueEntrySchema);

