import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema(
  {
    startTime: { type: String, required: true }, // '08:30'
    endTime: { type: String, required: true }, // '13:30'
    slotDurationMins: { type: Number, default: 15 },
    maxPatientsPerSlot: { type: Number, default: 1 },
  },
  { _id: false }
);

const dailyScheduleSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sun, 1 = Mon...
    isWorking: { type: Boolean, default: true },
    shifts: [shiftSchema],
  },
  { _id: false }
);

const doctorScheduleSchema = new mongoose.Schema(
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
      unique: true,
      index: true,
    },
    weeklySchedule: [dailyScheduleSchema],
    unavailability: [
      {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        reason: { type: String, default: 'Leave' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export const DoctorSchedule = mongoose.model('DoctorSchedule', doctorScheduleSchema);

