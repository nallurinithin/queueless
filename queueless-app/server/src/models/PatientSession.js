import mongoose from 'mongoose';

const patientSessionSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    bookingContactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingContact',
      required: true,
      index: true,
    },
    sessionTokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true, // Rolling idle expiry (default: 7 days)
      index: true,
    },
    absoluteExpiresAt: {
      type: Date,
      required: true, // Hard absolute cap (default: 30 days)
      index: true,
    },
    userAgent: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      default: '',
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

patientSessionSchema.index({ sessionTokenHash: 1, expiresAt: 1, revokedAt: 1 });

export const PatientSession = mongoose.model('PatientSession', patientSessionSchema);

