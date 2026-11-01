import mongoose from 'mongoose';

const bookingContactSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedPhone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    lastVerifiedAt: {
      type: Date,
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

bookingContactSchema.index({ clinicId: 1, normalizedPhone: 1 }, { unique: true });

export const BookingContact = mongoose.model('BookingContact', bookingContactSchema);

