import crypto from 'crypto';
import {
  Clinic,
  PaymentOrder,
  PaymentWebhookEvent,
  Appointment,
  APPOINTMENT_STATUS,
  PAYMENT_STATUS,
  SlotHold,
  AuditLog,
} from '../models/index.js';
import { logger } from '../shared/logger.js';
import { getRazorpayConfig } from '../config/razorpay.js';

export const paymentService = {
  /**
   * Create Checkout Order for a Held Slot
   * Invariant: Requires an active, unexpired 5-minute slot hold
   */
  async createPaymentOrder({ clinicId, appointmentId, bookingContactId }) {
    const config = getRazorpayConfig();

    const appointment = await Appointment.findOne({ _id: appointmentId, clinicId });
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    // Resolve deposit required and authoritative amount from appointment snapshot / fields
    const isDepositRequired = appointment.depositRequired !== false &&
      (appointment.policySnapshot?.depositRequired !== false);

    let depositAmount = 0;
    if (isDepositRequired) {
      if (typeof appointment.depositRequired === 'number' && appointment.depositRequired > 0) {
        depositAmount = appointment.depositRequired;
      } else if (appointment.policySnapshot?.depositAmount !== undefined && appointment.policySnapshot.depositAmount >= 0) {
        depositAmount = appointment.policySnapshot.depositAmount;
      } else if (appointment.depositAmount !== undefined && appointment.depositAmount > 0) {
        depositAmount = appointment.depositAmount;
      } else {
        const clinic = await Clinic.findById(clinicId);
        depositAmount = clinic?.depositPolicy?.enabled !== false ? (clinic?.depositPolicy?.defaultAmount ?? 100) : 0;
      }
    }

    if (!isDepositRequired || depositAmount <= 0 || appointment.paymentStatus === PAYMENT_STATUS.NOT_REQUIRED) {
      appointment.paymentStatus = PAYMENT_STATUS.NOT_REQUIRED;
      await appointment.save();
      return {
        paymentRequired: false,
        message: 'No advance deposit required.',
      };
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

    const amountInPaise = Math.round(depositAmount * 100);
    let orderId = `order_ql_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Create genuine Razorpay order via Razorpay API if credentials configured
    if (config.keyId && config.keySecret && !config.keyId.includes('placeholder')) {
      try {
        const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
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
            payment_capture: 1, // Explicit auto-capture for appointment commitment deposit
            notes: {
              appointmentId: appointment._id.toString(),
              bookingReference: appointment.bookingReference || '',
              clinicId: clinicId.toString(),
              mode: config.mode,
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
      mode: config.mode,
    });

    return {
      paymentRequired: true,
      orderId: paymentOrder.orderId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      keyId: config.keyId,
      mode: config.mode,
      slotHoldExpiresAt: appointment.slotHoldExpiresAt,
      depositAmountRupees: depositAmount,
    };
  },

  /**
   * Constant-Time HMAC-SHA256 Signature Verification for Client Return Callback
   */
  verifyPaymentSignature({ orderId, paymentId, signature, secret }) {
    if (!orderId || !paymentId || !signature) {
      return false;
    }
    const config = getRazorpayConfig();
    const verificationSecret = secret || config.keySecret;

    const expectedSignature = crypto
      .createHmac('sha256', verificationSecret)
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
  verifyWebhookSignature({ rawBody, signature, webhookSecret }) {
    if (!rawBody || !signature) {
      return false;
    }
    const config = getRazorpayConfig();
    const verificationSecret = webhookSecret || config.webhookSecret;

    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expectedSignature = crypto
      .createHmac('sha256', verificationSecret)
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
   * Environment Safety: Never mix Test orders with Live payment verification.
   */
  async confirmPaymentAndHold({ orderId, providerPaymentId, providerSignature }) {
    const config = getRazorpayConfig();

    const paymentOrder = await PaymentOrder.findOne({ orderId });
    if (!paymentOrder) {
      const err = new Error('Payment order not found.');
      err.statusCode = 404;
      throw err;
    }

    // Safety Invariant: Environment order isolation
    if (paymentOrder.mode && paymentOrder.mode !== config.mode) {
      const err = new Error(
        `[PAYMENT SAFETY] Mode mismatch: Order was created in ${paymentOrder.mode.toUpperCase()} mode, but current server environment is ${config.mode.toUpperCase()} mode. Never mix Test orders with Live payment verification!`
      );
      err.statusCode = 400;
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

    if (paymentOrder.status === PAYMENT_STATUS.REFUNDED) {
      return {
        confirmed: false,
        alreadyProcessed: true,
        message: 'Payment has already been refunded. Ignoring out-of-order capture event.',
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
          const currentOrder = await PaymentOrder.findOne({ orderId });
          if (currentOrder && (currentOrder.status === PAYMENT_STATUS.PAID || currentOrder.status === PAYMENT_STATUS.REFUNDED)) {
            logger.warn(`Ignored out-of-order payment.failed event for order ${orderId} in status ${currentOrder.status}`);
          } else {
            await PaymentOrder.findOneAndUpdate({ orderId }, { status: PAYMENT_STATUS.FAILED });
          }
        }
      } else if (eventPayload.event === 'refund.processed') {
        const refundEntity = eventPayload.payload?.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        const refundId = refundEntity?.id;
        if (refundId || paymentId) {
          await PaymentOrder.findOneAndUpdate(
            { $or: [{ refundId }, { providerPaymentId: paymentId }] },
            { status: PAYMENT_STATUS.REFUNDED, refundCompletedAt: new Date() }
          );
        }
      } else if (eventPayload.event === 'refund.failed') {
        const refundEntity = eventPayload.payload?.refund?.entity;
        const refundId = refundEntity?.id;
        if (refundId) {
          await PaymentOrder.findOneAndUpdate(
            { refundId },
            { reconciliationNotes: `Refund failed on Razorpay: ${refundEntity.error_description || 'Unknown error'}` }
          );
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
  async cancelAppointmentWithPolicy({
    clinicId,
    appointmentId,
    cancelledBy = 'PATIENT',
    bookingContactId,
    staffUser,
    reason = '',
  }) {
    const appointment = await Appointment.findOne({ _id: appointmentId, clinicId });
    if (!appointment) {
      const err = new Error('Appointment not found.');
      err.statusCode = 404;
      throw err;
    }

    // Patient IDOR Protection Guard
    if (cancelledBy === 'PATIENT' && bookingContactId) {
      if (!appointment.bookingContactId || !appointment.bookingContactId.equals(bookingContactId)) {
        const err = new Error('Forbidden: You are not authorized to cancel this appointment.');
        err.statusCode = 403;
        throw err;
      }
    }

    // Staff Cross-Clinic Isolation Guard
    if (staffUser?.clinicId && !appointment.clinicId.equals(staffUser.clinicId)) {
      const err = new Error('Forbidden: You cannot access or modify appointments belonging to another clinic.');
      err.statusCode = 403;
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
        // Staff/Clinic initiated -> Always 100% full refund of applicable deposit
        refundAmount = appointment.depositAmount;
        policyOutcome = 'FULL_REFUND_CLINIC_INITIATED';
      } else {
        // Patient initiated -> Evaluate cancellation deadline policy from snapshot or clinic settings
        let deadlineHours = 2;
        let pctBefore = 100;
        let pctAfter = 0;

        if (appointment.policySnapshot && appointment.policySnapshot.cancellationDeadlineHours !== undefined) {
          deadlineHours = appointment.policySnapshot.cancellationDeadlineHours;
          pctBefore = appointment.policySnapshot.refundPercentageBeforeDeadline ?? (appointment.policySnapshot.refundPercentage ?? 100);
          pctAfter = appointment.policySnapshot.refundPercentageAfterDeadline ?? 0;
        } else {
          const clinic = await Clinic.findById(clinicId);
          if (clinic?.cancellationPolicy) {
            deadlineHours = clinic.cancellationPolicy.deadlineHours ?? 2;
            pctBefore = clinic.cancellationPolicy.refundPercentageBeforeDeadline ?? (clinic.cancellationPolicy.refundPercentage ?? 100);
            pctAfter = clinic.cancellationPolicy.refundPercentageAfterDeadline ?? 0;
          }
        }

        const slotDate = appointment.allocatedSlot?.date || appointment.requestedWindow?.preferredDate;
        const slotTime = appointment.allocatedSlot?.startTime || '09:00';
        const slotDateTime = new Date(`${slotDate}T${slotTime}:00`);

        const now = new Date();
        const diffMs = slotDateTime.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffHours > deadlineHours) {
          refundAmount = Math.round((appointment.depositAmount * pctBefore) / 100);
          policyOutcome = (deadlineHours === 2 && pctBefore === 100)
            ? 'FULL_REFUND_PRIOR_TO_2_HOURS'
            : (pctBefore === 100 ? 'FULL_REFUND_PRIOR_TO_DEADLINE' : (pctBefore === 0 ? 'NO_REFUND' : 'PARTIAL_REFUND_PRIOR_TO_DEADLINE'));
        } else {
          refundAmount = Math.round((appointment.depositAmount * pctAfter) / 100);
          policyOutcome = (deadlineHours === 2 && pctAfter === 0)
            ? 'NO_REFUND_WITHIN_2_HOURS'
            : (pctAfter === 0 ? 'NO_REFUND_WITHIN_DEADLINE' : (pctAfter === 100 ? 'FULL_REFUND' : 'PARTIAL_REFUND_WITHIN_DEADLINE'));
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
      const config = getRazorpayConfig();
      if (
        paymentOrder.providerPaymentId &&
        paymentOrder.providerPaymentId.startsWith('pay_') &&
        config.keyId &&
        config.keySecret &&
        !config.keyId.includes('placeholder')
      ) {
        try {
          const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');
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
                  mode: config.mode,
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

