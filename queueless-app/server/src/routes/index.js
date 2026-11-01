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

const router = Router();

// Root API ping
router.get('/', (_req, res) => {
  res.json({
    name: 'QueueLess API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// v1 routes
router.use('/v1/staff/auth', staffAuthRoutes);
router.use('/v1/staff', staffManagementRoutes);
router.use('/v1/patient/auth', patientAuthRoutes);
router.use('/v1/clinic', clinicRoutes);

export default router;
