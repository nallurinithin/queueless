import mongoose from 'mongoose';
import { PAYMENT_STATUS } from './Appointment.js';

const paymentOrderSchema = new mongoose.Schema(
  {
    clinicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Clinic',
      required: true,
      index: true,
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Appointment',
      required: true,
      index: true,
    },
    bookingContactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BookingContact',
      required: true,
      index: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    amount: {
      type: Number, // In paise (e.g. 10000 = ₹100.00)
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },
    provider: {
      type: String,
      default: 'RAZORPAY',
    },
    providerPaymentId: {
      type: String,
      sparse: true,
      index: true,
    },
    providerSignature: {
      type: String,
    },
    refundId: {
      type: String,
      sparse: true,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundReason: {
      type: String,
      default: '',
    },
    refundInitiatedAt: {
      type: Date,
      default: null,
    },
    refundCompletedAt: {
      type: Date,
      default: null,
    },
    reconciliationNotes: {
      type: String,
      default: '',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

paymentOrderSchema.index({ clinicId: 1, status: 1 });
paymentOrderSchema.index({ clinicId: 1, createdAt: -1 });

export const PaymentOrder = mongoose.model('PaymentOrder', paymentOrderSchema);

