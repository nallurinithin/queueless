import { Router } from 'express';
import { queueService } from '../services/queueService.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import { QueueEntry, QUEUE_STATUS, STAFF_ROLES, Doctor, Department, Clinic } from '../models/index.js';

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
    const { doctorId, departmentId, departmentName, patientName, gender, age, phone } = req.body;

    let targetDeptId = departmentId;
    if (!targetDeptId && departmentName) {
      const dept = await Department.findOne({
        clinicId: req.clinicId,
        name: new RegExp(`^${departmentName}$`, 'i'),
        active: true,
      });
      targetDeptId = dept?._id;
    }

    if (!targetDeptId) {
      const defaultDept = await Department.findOne({ clinicId: req.clinicId, active: true });
      targetDeptId = defaultDept?._id;
    }

    let targetDoctorId = doctorId;
    if (!targetDoctorId) {
      // Find active doctor associated with this department
      const docQuery = { clinicId: req.clinicId, active: true };
      if (targetDeptId) {
        docQuery.departmentIds = targetDeptId;
      }
      const deptDoctor = await Doctor.findOne(docQuery);
      if (deptDoctor) {
        targetDoctorId = deptDoctor._id;
      } else if (!departmentId && !departmentName) {
        // Fallback only if no specific department was requested by client
        const fallbackDoctor = await Doctor.findOne({ clinicId: req.clinicId, active: true });
        targetDoctorId = fallbackDoctor?._id;
      }
    }

    if (!targetDoctorId) {
      return res.status(400).json({
        success: false,
        error: 'No active doctor is currently available in the selected department. Please assign a department with registered doctors on duty.',
      });
    }

    const result = await queueService.registerWalkIn({
      clinicId: req.clinicId,
      receptionistUser: req.staffUser,
      doctorId: targetDoctorId,
      departmentId: targetDeptId,
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

/**
 * GET /api/v1/staff/queue/tv-settings
 * Receptionist and clinic owner retrieve current TV display settings
 */
router.get('/tv-settings', async (req, res, next) => {
  try {
    const clinic = await Clinic.findById(req.clinicId);
    res.json({
      success: true,
      data: clinic?.tvDisplay || {
        broadcastEnabled: true,
        showPatientName: true,
        announcementLanguage: 'en',
        accessKey: 'aarogyam_tv_live',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/v1/staff/queue/tv-settings
 * Receptionist updates TV broadcast state, privacy name display, and announcement language
 */
router.put('/tv-settings', async (req, res, next) => {
  try {
    const { broadcastEnabled, showPatientName, announcementLanguage, accessKey } = req.body;
    const clinic = await Clinic.findById(req.clinicId);
    if (!clinic) return res.status(404).json({ success: false, error: 'Clinic not found.' });

    clinic.tvDisplay = {
      broadcastEnabled: broadcastEnabled !== undefined ? Boolean(broadcastEnabled) : (clinic.tvDisplay?.broadcastEnabled ?? true),
      showPatientName: showPatientName !== undefined ? Boolean(showPatientName) : (clinic.tvDisplay?.showPatientName ?? true),
      announcementLanguage: announcementLanguage || clinic.tvDisplay?.announcementLanguage || 'en',
      accessKey: accessKey || clinic.tvDisplay?.accessKey || 'aarogyam_tv_live',
    };

    await clinic.save();

    // Broadcast update via WebSockets to any active TV screens
    queueService.broadcastQueueUpdate(req.clinicId, 'queue:tv_settings_updated', clinic.tvDisplay);

    res.json({
      success: true,
      message: 'TV Display settings updated successfully.',
      data: clinic.tvDisplay,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

