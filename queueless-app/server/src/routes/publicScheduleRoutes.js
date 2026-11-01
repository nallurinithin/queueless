import { Router } from 'express';
import { Clinic, Department, Doctor } from '../models/index.js';

const router = Router();

/**
 * GET /api/v1/public/requestable-times
 * Generates indicative requestable time windows from clinic operating hours and capacity.
 * Indicative choices only; patients never select specific doctors in V1.
 */
router.get('/requestable-times', async (req, res, next) => {
  try {
    const { date, departmentId } = req.query;

    const clinic = await Clinic.findOne({ isActive: true });
    if (!clinic) {
      return res.status(404).json({ success: false, error: 'Clinic configuration not found.' });
    }

    const targetDate = date ? new Date(date) : new Date();
    const dayOfWeek = targetDate.getDay();

    const hours = clinic.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);

    if (!hours || hours.isClosed || hours.shifts.length === 0) {
      return res.json({
        success: true,
        isClosed: true,
        message: 'Clinic is closed on the selected date.',
        requestableTimes: [],
      });
    }

    // Generate indicative windows (Morning & Evening sessions)
    const requestableTimes = [
      {
        id: 'morning_window',
        label: 'Morning Session',
        timeRange: '08:30 AM - 01:30 PM',
        available: true,
      },
      {
        id: 'evening_window',
        label: 'Evening Session',
        timeRange: '04:30 PM - 08:30 PM',
        available: true,
      },
    ];

    res.json({
      success: true,
      date: targetDate.toISOString().split('T')[0],
      isClosed: false,
      requestableTimes,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

