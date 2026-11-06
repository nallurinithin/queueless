import crypto from 'crypto';
import {
  PaymentOrder,
  PaymentWebhookEvent,
  Appointment,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  SlotHold,
  AuditLog,
} from '../models/index.js';
import { logger } from '../shared/logger.js';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_aarogyam';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_secret_key_aarogyam_123';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_aarogyam_456';

export const paymentService = {
  /**
   * Create Checkout Order for a Held Slot
   * Invariant: Requires an active, unexpired 5-minute slot hold
   */
  async createPaymentOrder({ clinicId, appointmentId, bookingContactId }) {
    const appointment = await Appointment.findOne({ _id: appointmentId, clinicId });
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    if (appointment.status !== APPOINTMENT_STATUS.SLOT_HELD && appointment.status !== APPOINTMENT_STATUS.PENDING_REVIEW && appointment.status !== APPOINTMENT_STATUS.HOLD_EXPIRED) {
      const err = new Error(`Cannot initiate payment for appointment in status ${appointment.status}.`);
      err.statusCode = 400;
      throw err;
    }

    // Check if slot hold has expired
    if (
      appointment.status === APPOINTMENT_STATUS.HOLD_EXPIRED ||
      (appointment.slotHoldExpiresAt && new Date(appointment.slotHoldExpiresAt) <= new Date())
    ) {
      if (appointment.status === APPOINTMENT_STATUS.SLOT_HELD) {
        appointment.status = APPOINTMENT_STATUS.HOLD_EXPIRED;
        await appointment.save();
      }
      const err = new Error('Slot hold window has expired. Please ask reception to re-allocate the slot.');
      err.statusCode = 400;
      throw err;
    }

    // Walk-ins or zero-deposit clinics
    const depositAmount = appointment.depositRequired !== undefined ? appointment.depositRequired : 100;
    if (depositAmount <= 0) {
      appointment.paymentStatus = PAYMENT_STATUS.NOT_REQUIRED;
      await appointment.save();
      return {
        paymentRequired: false,
        message: 'No advance deposit required.',
      };
    }

    const amountInPaise = depositAmount * 100;
    let orderId = `order_ql_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Create genuine Razorpay order via Razorpay API if credentials configured
    if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET && !RAZORPAY_KEY_ID.includes('placeholder')) {
      try {
        const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
        const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${auth}`,
          },
          body: JSON.stringify({
            amount: amountInPaise,
            currency: 'INR',
            receipt: `rcpt_${appointment.bookingReference || appointment._id}`,
            notes: {
              appointmentId: appointment._id.toString(),
              bookingReference: appointment.bookingReference || '',
              clinicId: clinicId.toString(),
            },
          }),
        });
        const rzpData = await rzpRes.json();
        if (rzpData && rzpData.id) {
          orderId = rzpData.id;
        } else {
          logger.error('Razorpay order creation returned error:', rzpData);
        }
      } catch (err) {
        logger.error('Failed to create Razorpay order online, fallback to local order:', err);
      }
    }

    // Create pending payment order
    const paymentOrder = await PaymentOrder.create({
      clinicId,
      appointmentId: appointment._id,
      bookingContactId: bookingContactId || appointment.bookingContactId,
      patientId: appointment.patientId,
      orderId,
      amount: amountInPaise,
      currency: 'INR',
      status: PAYMENT_STATUS.PENDING,
      provider: 'RAZORPAY',
    });

    return {
      paymentRequired: true,
      orderId: paymentOrder.orderId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      keyId: RAZORPAY_KEY_ID,
      slotHoldExpiresAt: appointment.slotHoldExpiresAt,
      depositAmountRupees: depositAmount,
    };
  },

  /**
   * Constant-Time HMAC-SHA256 Signature Verification for Client Return Callback
   */
  verifyPaymentSignature({ orderId, paymentId, signature, secret = RAZORPAY_KEY_SECRET }) {
    if (!orderId || !paymentId || !signature) {
      return false;
    }
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'));
    } catch {
      return false;
    }
  },

  /**
   * Constant-Time Webhook Signature Verification against Raw Request Buffer
   */
  verifyWebhookSignature({ rawBody, signature, webhookSecret = RAZORPAY_WEBHOOK_SECRET }) {
    if (!rawBody || !signature) {
      return false;
    }

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyBuffer)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'));
    } catch {
      return false;
    }
  },

  /**
   * Confirm Payment & Reconcile with Slot Hold
   * Critical Invariant: Never silently overbook if hold expired before payment landed!
   */
  async confirmPaymentAndHold({ orderId, providerPaymentId, providerSignature }) {
    const paymentOrder = await PaymentOrder.findOne({ orderId });
    if (!paymentOrder) {
      const err = new Error('Payment order not found.');
      err.statusCode = 404;
      throw err;
    }

    if (paymentOrder.status === PAYMENT_STATUS.PAID) {
      return {
        confirmed: true,
        alreadyProcessed: true,
        message: 'Payment already confirmed.',
        paymentOrder,
      };
    }

    const appointment = await Appointment.findById(paymentOrder.appointmentId);
    if (!appointment) {
      const err = new Error('Associated appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    // CHECK RECONCILIATION: Did payment arrive after the 5-minute hold expired?
    const isHoldExpired =
      appointment.slotHoldExpiresAt && new Date(appointment.slotHoldExpiresAt) <= new Date();

    if (isHoldExpired) {
      // Payment arrived late! DO NOT silently overbook or force confirm!
      paymentOrder.status = PAYMENT_STATUS.RECONCILIATION_REQUIRED;
      paymentOrder.providerPaymentId = providerPaymentId;
      paymentOrder.providerSignature = providerSignature;
      paymentOrder.reconciliationNotes =
        'Payment succeeded after 5-minute slot hold expired. Requires staff re-allocation or refund.';
      await paymentOrder.save();

      appointment.status = APPOINTMENT_STATUS.HOLD_EXPIRED;
      appointment.paymentStatus = PAYMENT_STATUS.RECONCILIATION_REQUIRED;
      await appointment.save();

      await AuditLog.create({
        clinicId: appointment.clinicId,
        actorId: appointment.bookingContactId,
        actorRole: 'PATIENT',
        action: 'PAYMENT_LATE_RECONCILIATION_REQUIRED',
        entityType: 'Appointment',
        entityId: appointment._id.toString(),
        details: { orderId, providerPaymentId, note: 'Payment received after slot hold expiration.' },
      });

      return {
        confirmed: false,
        reconciliationRequired: true,
        message: 'Payment received after slot hold expired. Flagged for clinic staff reconciliation.',
        paymentOrder,
        appointment,
      };
    }

    // Hold is still valid: Confirm appointment and mark payment paid
    paymentOrder.status = PAYMENT_STATUS.PAID;
    paymentOrder.providerPaymentId = providerPaymentId;
    paymentOrder.providerSignature = providerSignature;
    await paymentOrder.save();

    appointment.status = APPOINTMENT_STATUS.CONFIRMED;
    appointment.paymentStatus = PAYMENT_STATUS.PAID;
    appointment.depositAmount = paymentOrder.amount / 100;
    await appointment.save();

    await AuditLog.create({
      clinicId: appointment.clinicId,
      actorId: appointment.bookingContactId,
      actorRole: 'PATIENT',
      action: 'PAYMENT_CONFIRMED',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      details: {
        orderId,
        providerPaymentId,
        depositAmount: appointment.depositAmount,
        slot: appointment.allocatedSlot,
      },
    });

    return {
      confirmed: true,
      reconciliationRequired: false,
      message: 'Deposit confirmed and appointment booked.',
      paymentOrder,
      appointment,
    };
  },

  /**
   * Webhook Ingestion Engine with Replay Attack & Idempotency Guards
   */
  async processWebhook({ rawBody, signature, eventId, eventPayload }) {
    // 1. Verify Webhook Signature
    const isValid = this.verifyWebhookSignature({ rawBody, signature });
    if (!isValid) {
      const err = new Error('Invalid webhook signature.');
      err.statusCode = 401;
      throw err;
    }

    // 2. Idempotency Guard: Enforce unique event ID constraint
    const existingEvent = await PaymentWebhookEvent.findOne({ eventId });
    if (existingEvent) {
      logger.info(`Duplicate webhook ignored: ${eventId}`);
      return {
        success: true,
        duplicate: true,
        message: 'Webhook event already processed.',
      };
    }

    // Record receipt
    const webhookRecord = await PaymentWebhookEvent.create({
      eventId,
      eventType: eventPayload.event || 'unknown',
      payload: eventPayload,
      status: 'RECEIVED',
    });

    // 3. Dispatch Event
    try {
      if (eventPayload.event === 'payment.captured') {
        const paymentEntity = eventPayload.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;

        if (orderId && paymentId) {
          await this.confirmPaymentAndHold({
            orderId,
            providerPaymentId: paymentId,
            providerSignature: signature,
          });
        }
      } else if (eventPayload.event === 'payment.failed') {
        const paymentEntity = eventPayload.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        if (orderId) {
          await PaymentOrder.findOneAndUpdate({ orderId }, { status: PAYMENT_STATUS.FAILED });
        }
      }

      webhookRecord.status = 'PROCESSED';
      webhookRecord.processedAt = new Date();
      await webhookRecord.save();

      return {
        success: true,
        duplicate: false,
        message: 'Webhook processed successfully.',
      };
    } catch (err) {
      webhookRecord.status = 'FAILED';
      webhookRecord.errorMessage = err.message;
      await webhookRecord.save();
      throw err;
    }
  },

  /**
   * Cancellation & Refund Engine with Disclosed Timing Policy
   * Policy:
   * - Clinic/Staff cancellation: 100% full refund
   * - Patient cancellation > 2 hours prior to slot: 100% full refund
   * - Patient cancellation <= 2 hours prior to slot: 0% refund (strictly non-refundable)
   */
  async cancelAppointmentWithPolicy({ clinicId, appointmentId, cancelledBy = 'PATIENT', reason = '' }) {
    const appointment = await Appointment.findOne({ _id: appointmentId, clinicId });
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return { success: true, message: 'Appointment already cancelled.', appointment };
    }

    let refundAmount = 0;
    let policyOutcome = 'NO_DEPOSIT_PAID';

    // Check if deposit was paid
    if (appointment.paymentStatus === PAYMENT_STATUS.PAID && appointment.depositAmount > 0) {
      if (cancelledBy === 'STAFF' || cancelledBy === 'CLINIC') {
        // Staff/Clinic initiated -> Always 100% full refund
        refundAmount = appointment.depositAmount;
        policyOutcome = 'FULL_REFUND_CLINIC_INITIATED';
      } else {
        // Patient initiated -> Evaluate 2-hour policy
        const slotDate = appointment.allocatedSlot?.date || appointment.requestedWindow?.preferredDate;
        const slotTime = appointment.allocatedSlot?.startTime || '09:00';
        const slotDateTime = new Date(`${slotDate}T${slotTime}:00`);

        const now = new Date();
        const diffMs = slotDateTime.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > 2) {
          refundAmount = appointment.depositAmount;
          policyOutcome = 'FULL_REFUND_PRIOR_TO_2_HOURS';
        } else {
          refundAmount = 0;
          policyOutcome = 'NO_REFUND_WITHIN_2_HOURS';
        }
      }
    }

    // Process refund tracking on PaymentOrder
    const paymentOrder = await PaymentOrder.findOne({
      appointmentId: appointment._id,
      status: PAYMENT_STATUS.PAID,
    });

    if (paymentOrder && refundAmount > 0) {
      paymentOrder.status = PAYMENT_STATUS.REFUNDED;
      paymentOrder.refundAmount = refundAmount * 100;
      paymentOrder.refundReason = reason || policyOutcome;
      paymentOrder.refundId = `ref_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      paymentOrder.refundCompletedAt = new Date();

      // Trigger official Razorpay refund if payment was made through Razorpay
      if (
        paymentOrder.providerPaymentId &&
        paymentOrder.providerPaymentId.startsWith('pay_') &&
        RAZORPAY_KEY_ID &&
        RAZORPAY_KEY_SECRET &&
        !RAZORPAY_KEY_ID.includes('placeholder')
      ) {
        try {
          const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
          const refundRes = await fetch(
            `https://api.razorpay.com/v1/payments/${paymentOrder.providerPaymentId}/refund`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${auth}`,
              },
              body: JSON.stringify({
                amount: refundAmount * 100,
                notes: {
                  appointmentId: appointment._id.toString(),
                  reason: reason || 'Clinic cancellation policy',
                },
              }),
            }
          );
          const refundData = await refundRes.json();
          if (refundData && refundData.id) {
            paymentOrder.refundId = refundData.id;
          }
        } catch (rfErr) {
          logger.error('Razorpay refund API call failed:', rfErr);
        }
      }
      await paymentOrder.save();

      appointment.paymentStatus = PAYMENT_STATUS.REFUNDED;
    }

    // Transition appointment to CANCELLED
    appointment.status = APPOINTMENT_STATUS.CANCELLED;
    appointment.cancellation = {
      cancelledBy,
      reason,
      cancelledAt: new Date(),
      refundOutcome: policyOutcome,
    };
    await appointment.save();

    // Release capacity / slot hold
    if (appointment.assignedDoctorId && appointment.allocatedSlot) {
      const capacityKey = `${clinicId}_${appointment.assignedDoctorId}_${appointment.allocatedSlot.date}_${appointment.allocatedSlot.startTime}`;
      await SlotHold.deleteOne({ capacityKey });
    }

    await AuditLog.create({
      clinicId,
      actorId: appointment.bookingContactId,
      actorRole: cancelledBy,
      action: 'APPOINTMENT_CANCELLED_WITH_REFUND_POLICY',
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      details: { refundAmount, policyOutcome, reason },
    });

    return {
      success: true,
      message: `Appointment cancelled. Refund outcome: ${policyOutcome}.`,
      appointment,
      refundAmount,
      policyOutcome,
    };
  },
};

