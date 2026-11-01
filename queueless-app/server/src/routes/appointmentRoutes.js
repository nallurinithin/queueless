import { Router } from 'express';
import { appointmentService } from '../services/appointmentService.js';
import { requirePatientAuth } from '../shared/middleware/auth.js';
import { Appointment } from '../models/index.js';

const router = Router();

/**
 * POST /api/v1/appointments/request
 * Patient requests an appointment (Self or Family Member)
 */
router.post('/request', requirePatientAuth, async (req, res, next) => {
  try {
    const { patientTarget, patientId, newPatientData, departmentId, requestedWindow } = req.body;

    const appointment = await appointmentService.requestAppointment({
      clinicId: req.clinicId,
      bookingContactId: req.bookingContact._id,
      patientTarget,
      patientId,
      newPatientData,
      departmentId,
      requestedWindow,
    });

    res.status(201).json({
      success: true,
      message: 'Appointment request submitted. Reception will review and allocate a confirmed slot.',
      data: {
        id: appointment._id.toString(),
        bookingReference: appointment.bookingReference,
        status: appointment.status,
        requestedWindow: appointment.requestedWindow,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/appointments/my-appointments
 * Retrieves all appointments belonging to the verified booking contact's household
 */
router.get('/my-appointments', requirePatientAuth, async (req, res, next) => {
  try {
    const appointments = await appointmentService.getAppointmentsForContact({
      bookingContactId: req.bookingContact._id,
      clinicId: req.clinicId,
    });

    res.json({
      success: true,
      data: appointments,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/appointments/reference/:reference
 * Looks up appointment status by public reference
 */
router.get('/reference/:reference', async (req, res, next) => {
  try {
    const appointment = await Appointment.findOne({
      bookingReference: req.params.reference.toUpperCase().trim(),
    })
      .select('bookingReference status requestedWindow allocatedSlot slotHoldExpiresAt depositAmount checkInAt')
      .populate('departmentId', 'name code')
      .populate('assignedDoctorId', 'roomNumber');

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Appointment not found.' });
    }

    res.json({
      success: true,
      data: appointment,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/appointments/:id/accept-alternative
 */
router.post('/:id/accept-alternative', requirePatientAuth, async (req, res, next) => {
  try {
    const result = await appointmentService.patientAcceptAlternative({
      appointmentId: req.params.id,
      bookingContactId: req.bookingContact._id,
    });

    res.json({
      success: true,
      message: 'Alternative slot accepted. 5-minute allocation hold activated.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/appointments/:id/cancel
 */
router.post('/:id/cancel', requirePatientAuth, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const appointment = await appointmentService.cancelAppointment({
      appointmentId: req.params.id,
      cancelledBy: 'PATIENT',
      reason,
    });

    res.json({
      success: true,
      message: 'Appointment cancelled successfully.',
      data: appointment,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

