import { Router } from 'express';
import { queueService } from '../services/queueService.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import { QueueEntry, QUEUE_STATUS, STAFF_ROLES } from '../models/index.js';

const router = Router();

router.use(requireStaffAuth, requireRole(STAFF_ROLES.RECEPTIONIST, STAFF_ROLES.DOCTOR, STAFF_ROLES.CLINIC_OWNER));

/**
 * GET /api/v1/staff/queue
 * Lists today's active queue
 */
router.get('/', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { doctorId } = req.query;

    const filter = { clinicId: req.clinicId, queueDate: today };
    if (doctorId) filter.doctorId = doctorId;

    const queue = await QueueEntry.find(filter)
      .populate('patientId', 'fullName gender age')
      .populate('departmentId', 'name code')
      .populate({ path: 'doctorId', populate: { path: 'staffUserId', select: 'name' } })
      .sort({ tokenSequence: 1 });

    res.json({
      success: true,
      data: queue,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/queue/walk-in
 * Receptionist registers a walk-in patient (FIFO token issued, 0 advance deposit)
 */
router.post('/walk-in', async (req, res, next) => {
  try {
    const { doctorId, departmentId, patientName, gender, age, phone } = req.body;

    const result = await queueService.registerWalkIn({
      clinicId: req.clinicId,
      receptionistUser: req.staffUser,
      doctorId,
      departmentId,
      patientName,
      gender,
      age,
      phone,
    });

    res.status(201).json({
      success: true,
      message: 'Walk-in patient registered and FIFO token generated.',
      data: {
        token: result.queueEntry.publicToken,
        tokenSequence: result.queueEntry.tokenSequence,
        status: result.queueEntry.queueStatus,
        patient: result.patient,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/queue/call-next
 * Calls next eligible patient. Clinical Safety Rule enforced: blocks if doctor is in consultation.
 */
router.post('/call-next', async (req, res, next) => {
  try {
    const { doctorId } = req.body;
    const targetDoctorId = doctorId || req.staffUser.doctorId;

    if (!targetDoctorId) {
      return res.status(400).json({ success: false, error: 'Doctor ID is required to call next patient.' });
    }

    const result = await queueService.callNext({
      clinicId: req.clinicId,
      staffUser: req.staffUser,
      doctorId: targetDoctorId,
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
 * POST /api/v1/staff/queue/:id/serve
 * Doctor starts consultation (CALLED -> SERVING)
 */
router.post('/:id/serve', async (req, res, next) => {
  try {
    const queueEntry = await queueService.startServing({
      clinicId: req.clinicId,
      doctorId: req.body.doctorId || req.staffUser.doctorId,
      queueEntryId: req.params.id,
    });

    res.json({
      success: true,
      message: 'Consultation started.',
      data: queueEntry,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/queue/:id/complete
 * Doctor finishes consultation (SERVING -> COMPLETED)
 */
router.post('/:id/complete', async (req, res, next) => {
  try {
    const queueEntry = await queueService.completeConsultation({
      clinicId: req.clinicId,
      doctorId: req.body.doctorId || req.staffUser.doctorId,
      queueEntryId: req.params.id,
    });

    res.json({
      success: true,
      message: 'Consultation completed.',
      data: queueEntry,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/queue/:id/skip
 */
router.post('/:id/skip', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const queueEntry = await queueService.skipPatient({
      clinicId: req.clinicId,
      staffUser: req.staffUser,
      queueEntryId: req.params.id,
      reason,
    });

    res.json({
      success: true,
      message: 'Patient marked skipped.',
      data: queueEntry,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/queue/:id/recall
 */
router.post('/:id/recall', async (req, res, next) => {
  try {
    const queueEntry = await queueService.recallPatient({
      clinicId: req.clinicId,
      staffUser: req.staffUser,
      queueEntryId: req.params.id,
    });

    res.json({
      success: true,
      message: 'Skipped patient recalled.',
      data: queueEntry,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

