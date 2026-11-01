import { QueueEntry, QUEUE_STATUS, Doctor } from '../models/index.js';
import { notificationOutboxService } from './notificationOutboxService.js';

const NOMINAL_CONSULTATION_MINS = 12;

export const estimateService = {
  /**
   * Calculate Dynamic Wait Time Estimate for a Queue Token
   * Uses observed completed consultation durations segmented by doctor
   */
  async calculateWaitEstimate({ clinicId, token, queueDate }) {
    const today = queueDate || new Date().toISOString().split('T')[0];
    const normalizedToken = (token || '').trim().toUpperCase();

    const targetEntry = await QueueEntry.findOne({
      clinicId,
      queueDate: today,
      publicToken: normalizedToken,
    }).populate({
      path: 'doctorId',
      populate: { path: 'staffUserId', select: 'name' },
    });

    if (!targetEntry) {
      const err = new Error(`Queue token ${normalizedToken} not found for today.`);
      err.statusCode = 404;
      throw err;
    }

    const doctorId = targetEntry.doctorId._id;

    // 1. Calculate observed rolling average consultation time today for this doctor
    const completedEntries = await QueueEntry.find({
      clinicId,
      doctorId,
      queueDate: today,
      queueStatus: QUEUE_STATUS.COMPLETED,
      servingAt: { $ne: null },
      completedAt: { $ne: null },
    });

    let avgConsultationMins = NOMINAL_CONSULTATION_MINS;
    if (completedEntries.length >= 2) {
      const totalDurationMins = completedEntries.reduce((sum, item) => {
        const durationMins = (new Date(item.completedAt) - new Date(item.servingAt)) / (1000 * 60);
        return sum + Math.max(3, durationMins); // floor at 3 mins
      }, 0);
      avgConsultationMins = Math.round(totalDurationMins / completedEntries.length);
    }

    // 2. Count waiting patients ahead of this token
    const patientsAhead = await QueueEntry.countDocuments({
      clinicId,
      doctorId,
      queueDate: today,
      queueStatus: QUEUE_STATUS.WAITING,
      tokenSequence: { $lt: targetEntry.tokenSequence },
    });

    // 3. Check if doctor is currently serving an active patient
    const activeServing = await QueueEntry.findOne({
      clinicId,
      doctorId,
      queueDate: today,
      queueStatus: QUEUE_STATUS.SERVING,
    });

    let currentServingRemainingMins = 0;
    if (activeServing && activeServing.servingAt) {
      const elapsedMins = (Date.now() - new Date(activeServing.servingAt).getTime()) / (1000 * 60);
      currentServingRemainingMins = Math.max(2, Math.round(avgConsultationMins - elapsedMins));
    }

    // 4. Calculate total estimated wait time
    let estimatedWaitMins = 0;
    if (targetEntry.queueStatus === QUEUE_STATUS.SERVING) {
      estimatedWaitMins = 0;
    } else if (targetEntry.queueStatus === QUEUE_STATUS.CALLED) {
      estimatedWaitMins = 0;
    } else {
      estimatedWaitMins = currentServingRemainingMins + patientsAhead * avgConsultationMins;
    }

    const minWaitMins = Math.max(0, estimatedWaitMins - 3);
    const maxWaitMins = estimatedWaitMins + 5;
    const isApproaching = targetEntry.queueStatus === QUEUE_STATUS.WAITING && (patientsAhead <= 2 || estimatedWaitMins <= 15);

    // 5. Approaching turn notification trigger (deduplicated to max 1 per visit)
    let alertTriggered = false;
    if (isApproaching) {
      const dedupKey = `approaching_${targetEntry._id.toString()}`;
      const enq = await notificationOutboxService.enqueue({
        clinicId,
        recipient: targetEntry.patientId ? `patient_${targetEntry.patientId}` : targetEntry.publicToken,
        recipientType: 'PATIENT',
        channel: 'SMS',
        eventType: 'queue.patient_approaching',
        title: 'Your turn is approaching',
        message: `Token ${targetEntry.publicToken}: You are next in line. Only ${patientsAhead} patient(s) ahead. Estimated wait ~${estimatedWaitMins} mins. Please be near the consultation room.`,
        payload: {
          token: targetEntry.publicToken,
          patientsAhead,
          estimatedWaitMins,
        },
        dedupKey,
      });
      alertTriggered = enq.enqueued;
    }

    return {
      token: targetEntry.publicToken,
      queueStatus: targetEntry.queueStatus,
      doctorName: targetEntry.doctorId?.staffUserId?.name || 'Dr. Practitioner',
      roomNumber: targetEntry.doctorId?.roomNumber || '101',
      patientsAhead,
      avgConsultationMins,
      estimatedWaitMins,
      range: `${minWaitMins} - ${maxWaitMins} mins`,
      isApproaching,
      alertTriggered,
      disclaimer: 'Wait times are approximate clinical estimates and may vary based on medical complexity.',
    };
  },
};

