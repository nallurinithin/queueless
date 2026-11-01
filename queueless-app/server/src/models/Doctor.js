import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    staffUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StaffUser',
      required: true,
      index: true,
    },
    departmentIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department',
      },
    ],
    roomNumber: {
      type: String,
      default: '',
    },
    scheduleConfig: {
      defaultSlotDurationMins: { type: Number, default: 15 },
      bufferMins: { type: Number, default: 0 },
      maxAppointmentsPerSlot: { type: Number, default: 1 },
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

doctorSchema.index({ clinicId: 1, staffUserId: 1 }, { unique: true });

export const Doctor = mongoose.model('Doctor', doctorSchema);
