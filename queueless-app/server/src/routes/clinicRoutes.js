import { Router } from 'express';
import { Clinic } from '../models/index.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import { STAFF_ROLES } from '../models/index.js';

const router = Router();

/**
 * GET /api/v1/clinic/profile
 * Public endpoint: returns clinic metadata, hours, deposit policy, languages
 */
router.get('/profile', async (req, res, next) => {
  try {
    const clinic = await Clinic.findOne({ isActive: true });
    if (!clinic) {
      return res.status(404).json({ success: false, error: 'Clinic configuration not found.' });
    }

    res.json({
      success: true,
      data: {
        id: clinic._id.toString(),
        name: clinic.name,
        slug: clinic.slug,
        timezone: clinic.timezone,
        address: clinic.address,
        contact: clinic.contact,
        operatingHours: clinic.operatingHours,
        settings: clinic.settings,
        depositPolicy: clinic.depositPolicy,
        cancellationPolicy: clinic.cancellationPolicy,
        localesEnabled: clinic.localesEnabled,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/clinic/settings
 * Owner only: updates clinic operational settings
 */
router.patch('/settings', requireStaffAuth, requireRole(STAFF_ROLES.CLINIC_OWNER), async (req, res, next) => {
  try {
    const clinic = await Clinic.findOne({ isActive: true });
    if (!clinic) {
      return res.status(404).json({ success: false, error: 'Clinic configuration not found.' });
    }

    const { settings, depositPolicy, cancellationPolicy } = req.body;
    if (settings) clinic.settings = { ...clinic.settings, ...settings };
    if (depositPolicy) clinic.depositPolicy = { ...clinic.depositPolicy, ...depositPolicy };
    if (cancellationPolicy) clinic.cancellationPolicy = { ...clinic.cancellationPolicy, ...cancellationPolicy };

    await clinic.save();

    res.json({
      success: true,
      message: 'Clinic settings updated successfully.',
      data: clinic,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
