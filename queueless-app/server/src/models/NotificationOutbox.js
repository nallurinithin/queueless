import mongoose from 'mongoose';

export const OUTBOX_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  DEAD_LETTER: 'DEAD_LETTER',
};

const notificationOutboxSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    recipient: {
      type: String, // E.164 phone or email
      required: true,
      trim: true,
    },
    recipientType: {
      type: String,
      enum: ['PATIENT', 'STAFF'],
      default: 'PATIENT',
    },
    channel: {
      type: String,
      enum: ['SMS', 'IN_APP', 'EMAIL'],
      default: 'SMS',
    },
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    templateId: {
      type: String,
    },
    title: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: Object.values(OUTBOX_STATUS),
      default: OUTBOX_STATUS.PENDING,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    nextRetryAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    // Deduplication key (e.g. approaching_${queueEntryId}) — unique sparse index prevents spam
    dedupKey: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationOutboxSchema.index({ status: 1, nextRetryAt: 1 });
notificationOutboxSchema.index({ clinicId: 1, createdAt: -1 });

export const NotificationOutbox = mongoose.model('NotificationOutbox', notificationOutboxSchema);

