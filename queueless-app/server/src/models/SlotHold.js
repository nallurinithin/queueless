import mongoose from 'mongoose';

export const SLOT_HOLD_STATUS = {
  ACTIVE: 'ACTIVE',
  CONFIRMED: 'CONFIRMED',
  EXPIRED: 'EXPIRED',
  RELEASED: 'RELEASED',
};

const slotHoldSchema = new mongoose.Schema(
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
    slotDate: {
      type: String, // 'YYYY-MM-DD'
      required: true,
    },
    startTime: {
      type: String, // 'HH:mm'
      required: true,
    },
    endTime: {
      type: String, // 'HH:mm'
      required: true,
    },
    // Unique deterministic capacity key: `${clinicId}_${doctorId}_${slotDate}_${startTime}`
    capacityKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(SLOT_HOLD_STATUS),
      default: SLOT_HOLD_STATUS.ACTIVE,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true, // 5 minutes strictly enforced
    },
  },
  {
    timestamps: true,
  }
);

slotHoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL cleanup of expired records if needed

export const SlotHold = mongoose.model('SlotHold', slotHoldSchema);
