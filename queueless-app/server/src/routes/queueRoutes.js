import { Router } from 'express';
import { queueService } from '../services/queueService.js';
import { Clinic, QueueEntry, QUEUE_STATUS, Appointment } from '../models/index.js';

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

    const clinic = await Clinic.findById(clinicId);
    const tvDisplay = clinic?.tvDisplay || {
      broadcastEnabled: true,
      showPatientName: true,
      announcementLanguage: 'en',
    };

    if (tvDisplay.broadcastEnabled === false) {
      return res.json({
        success: true,
        data: {
          broadcastEnabled: false,
          clinicName: clinic?.name || 'Aarogyam Community Clinic',
          nowServing: [],
          upNext: [],
          message: 'Waiting room TV display is currently offline.',
        },
      });
    }

    const data = await queueService.getWaitingRoomDisplay({ clinicId, date });
    res.json({
      success: true,
      data: {
        ...data,
        broadcastEnabled: true,
        showPatientName: tvDisplay.showPatientName,
        announcementLanguage: tvDisplay.announcementLanguage || 'en',
        clinicName: clinic?.name || 'Aarogyam Community Clinic',
      },
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
    const query = req.params.token.toUpperCase().trim();
    const today = new Date().toISOString().split('T')[0];

    let currentEntry = await QueueEntry.findOne({
      clinicId,
      queueDate: today,
      publicToken: query,
    }).populate({
      path: 'doctorId',
      populate: { path: 'staffUserId', select: 'name' },
    });

    if (!currentEntry) {
      // Check if the query is a booking reference (e.g. QL-XXXXXX)
      const appointment = await Appointment.findOne({
        clinicId,
        bookingReference: query,
      }).populate('assignedDoctorId').populate({
        path: 'assignedDoctorId',
        populate: { path: 'staffUserId', select: 'name' },
      });

      if (appointment) {
        currentEntry = await QueueEntry.findOne({
          appointmentId: appointment._id,
          queueDate: today,
        }).populate({
          path: 'doctorId',
          populate: { path: 'staffUserId', select: 'name' },
        });

        if (!currentEntry) {
          // Check if slot hold has expired
          let currentStatus = appointment.status;
          if (
            currentStatus === 'SLOT_HELD' &&
            appointment.slotHoldExpiresAt &&
            new Date(appointment.slotHoldExpiresAt) <= new Date()
          ) {
            currentStatus = 'HOLD_EXPIRED';
            Appointment.updateOne({ _id: appointment._id }, { $set: { status: 'HOLD_EXPIRED' } }).exec();
          }

          // Patient has an appointment record, but has not checked in today
          return res.json({
            success: true,
            data: {
              token: query,
              appointmentId: appointment._id,
              depositAmount: appointment.depositAmount || 100,
              slotHeldUntil: appointment.slotHoldExpiresAt,
              status: currentStatus === 'CONFIRMED' ? 'NOT_CHECKED_IN' : currentStatus,
              nowServing: '—',
              patientsAhead: 0,
              estimatedWaitMins: 0,
              doctorName: appointment.assignedDoctorId?.staffUserId?.name || 'Triage / Reception',
              roomNumber: appointment.assignedDoctorId?.roomNumber || '101',
              message: currentStatus === 'SLOT_HELD'
                ? 'Your slot is held for 5 minutes. Please pay ₹100 deposit to secure your booking.'
                : currentStatus === 'HOLD_EXPIRED'
                ? 'Your 5-minute slot hold has expired. Please contact reception to re-allocate a time slot.'
                : currentStatus === 'CONFIRMED'
                ? 'Your appointment is confirmed. Please complete on-site check-in at reception or via QR code upon arrival.'
                : 'Your appointment request is awaiting clinic review and slot allocation.',
            },
          });
        }
      }
    }

    if (!currentEntry) {
      return res.status(404).json({ success: false, error: 'Token or booking reference not found for today.' });
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

