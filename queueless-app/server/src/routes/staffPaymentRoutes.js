import { Router } from 'express';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import { PaymentOrder, PAYMENT_STATUS, STAFF_ROLES, Appointment, APPOINTMENT_STATUS } from '../models/index.js';

const router = Router();

router.use(requireStaffAuth, requireRole(STAFF_ROLES.RECEPTIONIST, STAFF_ROLES.CLINIC_OWNER));

/**
 * GET /api/v1/staff/payments/reconciliation
 * List all payments requiring staff reconciliation (e.g. late payments after hold expired)
 */
router.get('/reconciliation', async (req, res, next) => {
  try {
    const list = await PaymentOrder.find({
      clinicId: req.clinicId,
      status: PAYMENT_STATUS.RECONCILIATION_REQUIRED,
    })
      .populate('appointmentId')
      .populate('patientId', 'fullName gender age')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: list,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/payments/:id/reconcile
 * Staff resolves a reconciliation item: either 'MANUAL_CONFIRM' or 'REFUND'
 */
router.post('/:id/reconcile', async (req, res, next) => {
  try {
    const { action, notes } = req.body;
    const paymentOrder = await PaymentOrder.findOne({ _id: req.params.id, clinicId: req.clinicId });

    if (!paymentOrder) {
      return res.status(404).json({ success: false, error: 'Payment order not found.' });
    }

    if (action === 'MANUAL_CONFIRM') {
      paymentOrder.status = PAYMENT_STATUS.PAID;
      paymentOrder.reconciliationNotes = notes || 'Manually confirmed by clinic staff.';
      await paymentOrder.save();

      await Appointment.findByIdAndUpdate(paymentOrder.appointmentId, {
        status: APPOINTMENT_STATUS.CONFIRMED,
        paymentStatus: PAYMENT_STATUS.PAID,
      });

      return res.json({
        success: true,
        message: 'Payment and appointment manually confirmed.',
        data: paymentOrder,
      });
    } else if (action === 'REFUND') {
      paymentOrder.status = PAYMENT_STATUS.REFUNDED;
      paymentOrder.refundAmount = paymentOrder.amount;
      paymentOrder.refundReason = notes || 'Refund issued due to expired hold.';
      paymentOrder.refundCompletedAt = new Date();
      await paymentOrder.save();

      await Appointment.findByIdAndUpdate(paymentOrder.appointmentId, {
        paymentStatus: PAYMENT_STATUS.REFUNDED,
      });

      return res.json({
        success: true,
        message: 'Refund issued for expired hold payment.',
        data: paymentOrder,
      });
    }

    res.status(400).json({ success: false, error: 'Invalid reconciliation action. Must be MANUAL_CONFIRM or REFUND.' });
  } catch (err) {
    next(err);
  }
});

export default router;

