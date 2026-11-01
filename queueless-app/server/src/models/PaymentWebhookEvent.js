import mongoose from 'mongoose';

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      index: true,
    },
    // Provider unique event ID — unique index enforces idempotency against duplicate delivery
    eventId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE_IGNORED'],
      default: 'RECEIVED',
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const PaymentWebhookEvent = mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);
