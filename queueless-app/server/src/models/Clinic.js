import mongoose from 'mongoose';

const operatingHoursSchema = new mongoose.Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6, // 0 = Sunday, 1 = Monday, ...
    },
    isClosed: {
      type: Boolean,
      default: false,
    },
    shifts: [
      {
        startTime: { type: String, required: true }, // '08:30'
        endTime: { type: String, required: true }, // '13:30'
      },
    ],
  },
  { _id: false }
);

const clinicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      postalCode: { type: String, default: '' },
      country: { type: String, default: 'IN' },
    },
    contact: {
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
    },
    operatingHours: [operatingHoursSchema],
    settings: {
      defaultConsultationDurationMins: { type: Number, default: 15 },
      slotHoldDurationSecs: { type: Number, default: 300 }, // 5 minutes (system-controlled)
      defaultDepositAmount: { type: Number, default: 120 },
      earlyCheckInWindowMins: { type: Number, default: 15 },
      lateGracePeriodMins: { type: Number, default: 5 },
      noShowReviewWindowMins: { type: Number, default: 15 },
      callAnnounceRepeat: { type: Number, default: 2 },
      callAnnounceIntervalSecs: { type: Number, default: 60 },
    },
    depositPolicy: {
      enabled: { type: Boolean, default: true },
      defaultAmount: { type: Number, default: 100, min: 0 },
      walkInRequiresDeposit: { type: Boolean, default: false }, // Walk-ins pay 0 advance deposit
    },
    cancellationPolicy: {
      deadlineHours: { type: Number, default: 2, min: 0 },
      refundPercentageBeforeDeadline: { type: Number, default: 100, min: 0, max: 100 },
      refundPercentageAfterDeadline: { type: Number, default: 0, min: 0, max: 100 },
      clinicCancellationRefundPercentage: { type: Number, default: 100 }, // Clinic-initiated is always 100%
      refundPercentage: { type: Number, default: 100 }, // Legacy alias for refundPercentageBeforeDeadline
    },
    localesEnabled: {
      type: [String],
      default: ['en', 'hi', 'te'],
    },
    tvDisplay: {
      broadcastEnabled: { type: Boolean, default: true },
      showPatientName: { type: Boolean, default: false },
      announcementLanguage: { type: String, enum: ['en', 'hi', 'te'], default: 'en' },
      accessKey: { type: String, default: 'aarogyam_tv_live' },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Clinic = mongoose.model('Clinic', clinicSchema);
