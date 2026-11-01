import mongoose from 'mongoose';

const queueSequenceCounterSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    doctorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      index: true,
    },
    queueDate: {
      type: String, // 'YYYY-MM-DD'
      required: true,
      index: true,
    },
    lastSequence: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

queueSequenceCounterSchema.index({ clinicId: 1, doctorId: 1, queueDate: 1 }, { unique: true });

export const QueueSequenceCounter = mongoose.model('QueueSequenceCounter', queueSequenceCounterSchema);

