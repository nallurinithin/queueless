import { Router } from 'express';
import { paymentService } from '../services/paymentService.js';
import { Clinic } from '../models/index.js';

const router = Router();

async function getActiveClinicId() {
  const clinic = await Clinic.findOne({ isActive: true });
  return clinic ? clinic._id : null;
}

/**
 * POST /api/v1/payments/create-order
 * Patient initiates checkout for an appointment in SLOT_HELD state
 */
router.post('/create-order', async (req, res, next) => {
  try {
    const { appointmentId } = req.body;
    const clinicId = await getActiveClinicId();

    const orderData = await paymentService.createPaymentOrder({
      clinicId,
      appointmentId,
    });

    res.json({
      success: true,
      data: orderData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/payments/verify
 * Client returns after Razorpay checkout
 */
router.post('/verify', async (req, res, next) => {
  try {
    const { orderId, paymentId, signature } = req.body;

    const isValid = paymentService.verifyPaymentSignature({
      orderId,
      paymentId,
      signature,
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature. Verification failed.',
      });
    }

    const result = await paymentService.confirmPaymentAndHold({
      orderId,
      providerPaymentId: paymentId,
      providerSignature: signature,
    });

    res.json({
      success: result.confirmed,
      reconciliationRequired: result.reconciliationRequired,
      message: result.message,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/payments/webhook
 * Provider webhook receiver (Razorpay)
 * Reads req.rawBody and verifies webhook HMAC-SHA256 signature
 */
router.post('/webhook', async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const eventId = req.headers['x-razorpay-event-id'] || req.body?.event_id || `evt_${Date.now()}`;
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const result = await paymentService.processWebhook({
      rawBody,
      signature,
      eventId,
      eventPayload: req.body,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/payments/cancel
 * Cancel appointment with 2-hour refund policy evaluation
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const { appointmentId, reason } = req.body;
    const clinicId = await getActiveClinicId();

    const result = await paymentService.cancelAppointmentWithPolicy({
      clinicId,
      appointmentId,
      cancelledBy: 'PATIENT',
      reason,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

