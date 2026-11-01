import { Router } from 'express';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import { notificationOutboxService } from '../services/notificationOutboxService.js';
import { NotificationOutbox, STAFF_ROLES } from '../models/index.js';

const router = Router();

router.use(requireStaffAuth, requireRole(STAFF_ROLES.RECEPTIONIST, STAFF_ROLES.CLINIC_OWNER));

/**
 * GET /api/v1/staff/notifications/outbox
 * Staff inspects outbox message delivery status
 */
router.get('/outbox', async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query;
    const filter = { clinicId: req.clinicId };
    if (status) filter.status = status;

    const list = await NotificationOutbox.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    const counts = {
      pending: await NotificationOutbox.countDocuments({ clinicId: req.clinicId, status: 'PENDING' }),
      delivered: await NotificationOutbox.countDocuments({ clinicId: req.clinicId, status: 'DELIVERED' }),
      failed: await NotificationOutbox.countDocuments({ clinicId: req.clinicId, status: 'FAILED' }),
      deadLetter: await NotificationOutbox.countDocuments({ clinicId: req.clinicId, status: 'DEAD_LETTER' }),
    };

    res.json({
      success: true,
      counts,
      data: list,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/notifications/outbox/:id/retry
 * Staff manually retries dead-letter or failed notification
 */
router.post('/outbox/:id/retry', async (req, res, next) => {
  try {
    const item = await notificationOutboxService.retryDeadLetter(req.params.id);
    res.json({
      success: true,
      message: 'Outbox notification reset to PENDING.',
      data: item,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

