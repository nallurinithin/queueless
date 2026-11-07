import { Router } from 'express';
import crypto from 'crypto';
import { notificationOutboxService } from '../services/notificationOutboxService.js';
import { estimateService } from '../services/estimateService.js';
import { Clinic, StaffSession, StaffUser } from '../models/index.js';

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
 * Protected worker trigger endpoint to deliver pending notifications.
 * Requires valid worker secret header or authenticated staff session.
 */
router.post('/process-outbox', async (req, res, next) => {
  try {
    const expectedSecret = process.env.WORKER_SECRET || 'queueless_worker_secret';
    const incomingSecret =
      req.headers['x-worker-secret'] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    let isAuthorized = incomingSecret === expectedSecret;
    if (!isAuthorized && (req.cookies?.queueless_staff_session || incomingSecret)) {
      const rawStaffToken = req.cookies?.queueless_staff_session || incomingSecret;
      const tokenHash = crypto.createHash('sha256').update(rawStaffToken).digest('hex');
      const session = await StaffSession.findOne({
        sessionTokenHash: tokenHash,
        expiresAt: { $gt: new Date() },
        revokedAt: null,
      });
      if (session) {
        const staffUser = await StaffUser.findById(session.staffUserId);
        if (staffUser && staffUser.status === 'ACTIVE' && ['RECEPTIONIST', 'CLINIC_OWNER'].includes(staffUser.role)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Valid worker secret or authorized staff session required.',
        code: 'UNAUTHORIZED',
      });
    }

    const clinicId = await getActiveClinicId();
    const { batchSize, forceFailure } = req.body;

    // Security Guard: forceFailure injection is strictly restricted to automated test runs
    const safeForceFailure = process.env.NODE_ENV === 'test' && Boolean(forceFailure);

    const summary = await notificationOutboxService.processOutbox({
      clinicId,
      batchSize: batchSize || 10,
      forceFailure: safeForceFailure,
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

