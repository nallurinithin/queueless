import mongoose from 'mongoose';

const staffInvitationTokenSchema = new mongoose.Schema(
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
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
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

staffInvitationTokenSchema.index({ tokenHash: 1, expiresAt: 1 });

export const StaffInvitationToken = mongoose.model('StaffInvitationToken', staffInvitationTokenSchema);

