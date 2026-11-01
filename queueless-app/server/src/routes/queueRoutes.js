import { Router } from 'express';
import { queueService } from '../services/queueService.js';
import { Clinic, QueueEntry, QUEUE_STATUS } from '../models/index.js';

const router = Router();

async function getActiveClinicId() {
  const clinic = await Clinic.findOne({ isActive: true });
  return clinic ? clinic._id : null;
}

/**
 * POST /api/v1/queue/check-in
 * Patient checks in using booking reference (QR code or reference input)
 */
router.post('/check-in', async (req, res, next) => {
  try {
    const { bookingReference } = req.body;
    const clinicId = await getActiveClinicId();

    const result = await queueService.checkInAppointment({
      clinicId,
      bookingReference,
    });

    res.json({
      success: true,
      message: result.message,
      alreadyCheckedIn: result.alreadyCheckedIn,
      data: {
        token: result.queueEntry.publicToken,
        tokenSequence: result.queueEntry.tokenSequence,
        status: result.queueEntry.queueStatus,
        checkedInAt: result.queueEntry.checkedInAt,
        estimatedWaitMins: result.queueEntry.estimatedWaitMins,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/queue/display
 * Privacy-preserving live waiting room display data
 * ZERO names, phone numbers, or visit reasons exposed
 */
router.get('/display', async (req, res, next) => {
  try {
    const clinicId = await getActiveClinicId();
    const { date } = req.query;

    const data = await queueService.getWaitingRoomDisplay({ clinicId, date });
    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/queue/track/:token
 * Live token position tracking for patient's personal device
 */
router.get('/track/:token', async (req, res, next) => {
  try {
    const clinicId = await getActiveClinicId();
    const normalizedToken = req.params.token.toUpperCase().trim();
    const today = new Date().toISOString().split('T')[0];

    const currentEntry = await QueueEntry.findOne({
      clinicId,
      queueDate: today,
      publicToken: normalizedToken,
    }).populate({
      path: 'doctorId',
      populate: { path: 'staffUserId', select: 'name' },
    });

    if (!currentEntry) {
      return res.status(404).json({ success: false, error: 'Token not found for today.' });
    }

    // Calculate patients ahead in the same doctor queue
    const patientsAhead = await QueueEntry.countDocuments({
      clinicId,
      doctorId: currentEntry.doctorId._id,
      queueDate: today,
      queueStatus: QUEUE_STATUS.WAITING,
      tokenSequence: { $lt: currentEntry.tokenSequence },
    });

    // Find token currently in SERVING for this doctor
    const servingEntry = await QueueEntry.findOne({
      clinicId,
      doctorId: currentEntry.doctorId._id,
      queueDate: today,
      queueStatus: QUEUE_STATUS.SERVING,
    });

    res.json({
      success: true,
      data: {
        token: currentEntry.publicToken,
        status: currentEntry.queueStatus,
        nowServing: servingEntry ? servingEntry.publicToken : 'None',
        patientsAhead,
        estimatedWaitMins: Math.max(5, patientsAhead * 12),
        doctorName: currentEntry.doctorId?.staffUserId?.name || 'Dr. Practitioner',
        roomNumber: currentEntry.doctorId?.roomNumber || '101',
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

