import { Router } from 'express';
import { appointmentService } from '../services/appointmentService.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import { Appointment, APPOINTMENT_STATUS, STAFF_ROLES } from '../models/index.js';

const router = Router();

// Accessible by Receptionist and Clinic Owner
router.use(requireStaffAuth, requireRole(STAFF_ROLES.RECEPTIONIST, STAFF_ROLES.CLINIC_OWNER));

/**
 * GET /api/v1/staff/appointments/pending
 * Lists all pending appointment requests awaiting review
 */
router.get('/pending', async (req, res, next) => {
  try {
    const pending = await Appointment.find({
      clinicId: req.clinicId,
      status: APPOINTMENT_STATUS.PENDING_REVIEW,
    })
      .populate('patientId', 'fullName gender age')
      .populate('bookingContactId', 'phone normalizedPhone')
      .populate('departmentId', 'name code')
      .sort({ createdAt: 1 });

    res.json({
      success: true,
      data: pending,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/appointments/:id/allocate
 * Receptionist allocates doctor and actual available slot (creates 5-minute hold)
 */
router.post('/:id/allocate', async (req, res, next) => {
  try {
    const { doctorId, slotDate, startTime, endTime } = req.body;

    if (!doctorId || !slotDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Doctor ID, slot date, start time, and end time are required.',
      });
    }

    const result = await appointmentService.allocateSlotAtomic({
      appointmentId: req.params.id,
      receptionistUser: req.staffUser,
      doctorId,
      slotDate,
      startTime,
      endTime,
    });

    res.json({
      success: true,
      message: 'Slot allocated. 5-minute payment/confirmation hold activated.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/appointments/:id/propose-alternative
 */
router.post('/:id/propose-alternative', async (req, res, next) => {
  try {
    const { proposedDoctorId, proposedSlot, reason } = req.body;

    const result = await appointmentService.proposeAlternative({
      appointmentId: req.params.id,
      receptionistUser: req.staffUser,
      proposedDoctorId,
      proposedSlot,
      reason,
    });

    res.json({
      success: true,
      message: 'Alternative slot proposed to patient.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/appointments/:id/confirm-no-payment
 * Explicit authorized confirmation for clinic-created appointments or where payment is not required
 */
router.post('/:id/confirm-no-payment', async (req, res, next) => {
  try {
    const result = await appointmentService.confirmAppointment({
      appointmentId: req.params.id,
      staffUser: req.staffUser,
    });

    res.json({
      success: true,
      message: 'Appointment confirmed successfully without advance payment.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/staff/patients/duplicate-check
 * Receptionist assisted duplicate warning check
 */
router.get('/duplicate-check', async (req, res, next) => {
  try {
    const { phone, name } = req.query;
    const candidates = await appointmentService.searchDuplicateCandidates({
      clinicId: req.clinicId,
      fullName: name,
      phone,
    });

    res.json({
      success: true,
      hasCandidates: candidates.length > 0,
      candidates,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

