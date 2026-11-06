import { Router } from 'express';
import mongoose from 'mongoose';
import { appointmentService } from '../services/appointmentService.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import {
  Appointment,
  APPOINTMENT_STATUS,
  STAFF_ROLES,
  Doctor,
  Department,
  StaffUser,
} from '../models/index.js';

const router = Router();

// Accessible by Receptionist and Clinic Owner
router.use(requireStaffAuth, requireRole(STAFF_ROLES.RECEPTIONIST, STAFF_ROLES.CLINIC_OWNER));

/**
 * GET /api/v1/staff/appointments/departments
 * Accessible by Receptionist & Clinic Owner to populate department selectors
 */
router.get('/departments', async (req, res, next) => {
  try {
    const depts = await Department.find({ clinicId: req.clinicId, active: true }).sort({ name: 1 });
    const mapped = depts.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      code: d.code,
      description: d.description || '',
    }));

    res.json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/staff/appointments/doctors
 * Accessible by Receptionist & Clinic Owner to populate practitioner selectors
 */
router.get('/doctors', async (req, res, next) => {
  try {
    const docs = await Doctor.find({ clinicId: req.clinicId, active: true })
      .populate('staffUserId', 'name email status')
      .populate('departmentIds', 'name code');

    const mapped = docs.map((d) => {
      const validDepts = (d.departmentIds || []).filter(Boolean);
      return {
        id: d._id.toString(),
        name: `${d.staffUserId?.name || 'Dr. Practitioner'} (${d.roomNumber || 'Room 101'})`,
        doctorName: d.staffUserId?.name || 'Dr. Practitioner',
        roomNumber: d.roomNumber || 'Room 101',
        departments: validDepts.map((dp) => dp.name),
        departmentIds: validDepts.map((dp) => dp._id.toString()),
      };
    });

    res.json({
      success: true,
      data: mapped,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/staff/appointments/pending
 * Lists all pending appointment requests awaiting review
 */
router.get('/pending', async (req, res, next) => {
  try {
    const now = new Date();

    // Auto-transition expired holds to HOLD_EXPIRED
    await Appointment.updateMany(
      {
        clinicId: req.clinicId,
        status: APPOINTMENT_STATUS.SLOT_HELD,
        slotHoldExpiresAt: { $lte: now },
      },
      {
        $set: { status: APPOINTMENT_STATUS.HOLD_EXPIRED }
      }
    );

    const pending = await Appointment.find({
      clinicId: req.clinicId,
      status: {
        $in: [
          APPOINTMENT_STATUS.PENDING_REVIEW,
          APPOINTMENT_STATUS.SLOT_HELD,
          APPOINTMENT_STATUS.HOLD_EXPIRED,
          APPOINTMENT_STATUS.ALTERNATIVE_PROPOSED,
        ],
      },
    })
      .populate('patientId', 'fullName gender age')
      .populate('bookingContactId', 'phone normalizedPhone')
      .populate('departmentId', 'name code')
      .populate('assignedDoctorId')
      .populate({
        path: 'assignedDoctorId',
        populate: { path: 'staffUserId', select: 'name' },
      })
      .sort({ updatedAt: -1, createdAt: -1 });

    res.json({
      success: true,
      data: pending,
    });
  } catch (err) {
    console.error('[STAFF APPOINTMENTS /pending ERROR]:', err);
    next(err);
  }
});

/**
 * POST /api/v1/staff/appointments/:id/allocate
 * Receptionist allocates doctor and actual available slot (creates 5-minute hold)
 */
router.post('/:id/allocate', async (req, res, next) => {
  try {
    const { doctorId, slotDate, startTime, endTime, departmentName, confirmImmediately } = req.body;

    if (!slotDate || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: 'Slot date, start time, and end time are required.',
      });
    }

    // Resolve Doctor ID (handle either Doctor ID or StaffUser ID, with safe ObjectId check)
    let targetDoctor = null;
    if (doctorId && mongoose.isValidObjectId(doctorId)) {
      targetDoctor = await Doctor.findOne({
        clinicId: req.clinicId,
        $or: [{ _id: doctorId }, { staffUserId: doctorId }],
      });

      if (!targetDoctor) {
        const staffDoc = await StaffUser.findOne({
          clinicId: req.clinicId,
          _id: doctorId,
          role: STAFF_ROLES.DOCTOR,
        });

        if (staffDoc) {
          targetDoctor = await Doctor.create({
            clinicId: req.clinicId,
            staffUserId: staffDoc._id,
            departmentIds: staffDoc.departmentIds || [],
            roomNumber: 'Room 101',
            active: true,
          });
        }
      }
    }

    if (!targetDoctor) {
      targetDoctor = await Doctor.findOne({ clinicId: req.clinicId, active: true });
    }

    if (!targetDoctor) {
      return res.status(400).json({
        success: false,
        error: 'No active doctor found to assign to this appointment.',
      });
    }

    // Resolve and assign Department if departmentName is passed
    if (departmentName) {
      const dept = await Department.findOne({
        clinicId: req.clinicId,
        name: new RegExp('^' + departmentName + '$', 'i'),
      });
      if (dept) {
        await Appointment.findByIdAndUpdate(req.params.id, { departmentId: dept._id });
      }
    }

    const result = await appointmentService.allocateSlotAtomic({
      appointmentId: req.params.id,
      receptionistUser: req.staffUser,
      doctorId: targetDoctor._id,
      slotDate,
      startTime,
      endTime,
    });

    if (confirmImmediately) {
      await appointmentService.confirmAppointment({
        appointmentId: req.params.id,
        staffUser: req.staffUser,
      });
    }

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
