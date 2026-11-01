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

export const QueueEntry = mongoose.model('QueueEntry', queueEntrySchema);

