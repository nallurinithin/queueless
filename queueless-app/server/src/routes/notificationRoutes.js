import { Router } from 'express';
import { notificationOutboxService } from '../services/notificationOutboxService.js';
import { estimateService } from '../services/estimateService.js';
import { Clinic } from '../models/index.js';

const router = Router();

async function getActiveClinicId() {
  const clinic = await Clinic.findOne({ isActive: true });
  return clinic ? clinic._id : null;
}

/**
 * GET /api/v1/notifications/estimate/:token
 * Dynamic wait time estimation for a token
 */
router.get('/estimate/:token', async (req, res, next) => {
  try {
    const clinicId = await getActiveClinicId();
    const result = await estimateService.calculateWaitEstimate({
      clinicId,
      token: req.params.token,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/notifications/process-outbox
 * Worker trigger endpoint to deliver pending notifications
 */
router.post('/process-outbox', async (req, res, next) => {
  try {
    const clinicId = await getActiveClinicId();
    const { batchSize, forceFailure } = req.body;

    const summary = await notificationOutboxService.processOutbox({
      clinicId,
      batchSize: batchSize || 10,
      forceFailure: Boolean(forceFailure),
    });

    res.json({
      success: true,
      data: summary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

