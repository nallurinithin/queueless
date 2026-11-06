/**
 * Main API Router
 *
 * Mounts all module routes onto /api.
 */

import { Router } from 'express';
import staffAuthRoutes from './staffAuthRoutes.js';
import staffManagementRoutes from './staffManagementRoutes.js';
import patientAuthRoutes from './patientAuthRoutes.js';
import clinicRoutes from './clinicRoutes.js';
import appointmentRoutes from './appointmentRoutes.js';
import staffAppointmentRoutes from './staffAppointmentRoutes.js';
import publicScheduleRoutes from './publicScheduleRoutes.js';
import queueRoutes from './queueRoutes.js';
import staffQueueRoutes from './staffQueueRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import staffPaymentRoutes from './staffPaymentRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import staffNotificationRoutes from './staffNotificationRoutes.js';

const router = Router();

// Root API ping
router.get('/', (_req, res) => {
  res.json({
    name: 'QueueLess API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// v1 routes - specific prefixes must come BEFORE general /v1/staff prefix
router.use('/v1/staff/auth', staffAuthRoutes);
router.use('/v1/staff/appointments', staffAppointmentRoutes);
router.use('/v1/staff/patients', staffAppointmentRoutes);
router.use('/v1/staff/queue', staffQueueRoutes);
router.use('/v1/staff/payments', staffPaymentRoutes);
router.use('/v1/staff/notifications', staffNotificationRoutes);
router.use('/v1/staff', staffManagementRoutes);

router.use('/v1/patient/auth', patientAuthRoutes);
router.use('/v1/clinic', clinicRoutes);
router.use('/v1/appointments', appointmentRoutes);
router.use('/v1/queue', queueRoutes);
router.use('/v1/payments', paymentRoutes);
router.use('/v1/notifications', notificationRoutes);
router.use('/v1/public', publicScheduleRoutes);

export default router;
