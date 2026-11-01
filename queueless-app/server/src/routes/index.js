/**
 * Main API Router
 *
 * Mounts all module routes onto /api.
 */

import { Router } from 'express';

const router = Router();

// Root API ping
router.get('/', (_req, res) => {
  res.json({
    name: 'QueueLess API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

export default router;

