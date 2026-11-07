import { Router } from 'express';
import { Clinic, AuditLog, STAFF_ROLES } from '../models/index.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';

const router = Router();

/**
 * Validate policy payload before applying updates
 */
function validatePoliciesPayload(body) {
  const { depositPolicy, cancellationPolicy } = body;

  if (depositPolicy) {
    if (depositPolicy.enabled !== undefined && typeof depositPolicy.enabled !== 'boolean') {
      const err = new Error('depositPolicy.enabled must be a boolean.');
      err.statusCode = 400;
      throw err;
    }

    if (depositPolicy.defaultAmount !== undefined) {
      const amt = Number(depositPolicy.defaultAmount);
      if (isNaN(amt) || amt < 0 || !isFinite(amt)) {
        const err = new Error('depositPolicy.defaultAmount must be a valid non-negative number.');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  if (cancellationPolicy) {
    if (cancellationPolicy.deadlineHours !== undefined) {
      const hours = Number(cancellationPolicy.deadlineHours);
      if (isNaN(hours) || hours < 0 || !isFinite(hours)) {
        const err = new Error('cancellationPolicy.deadlineHours must be a valid non-negative number.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (cancellationPolicy.refundPercentageBeforeDeadline !== undefined) {
      const pct = Number(cancellationPolicy.refundPercentageBeforeDeadline);
      if (isNaN(pct) || pct < 0 || pct > 100 || !isFinite(pct)) {
        const err = new Error('refundPercentageBeforeDeadline must be a percentage between 0 and 100.');
        err.statusCode = 400;
        throw err;
      }
    }

    if (cancellationPolicy.refundPercentageAfterDeadline !== undefined) {
      const pct = Number(cancellationPolicy.refundPercentageAfterDeadline);
      if (isNaN(pct) || pct < 0 || pct > 100 || !isFinite(pct)) {
        const err = new Error('refundPercentageAfterDeadline must be a percentage between 0 and 100.');
        err.statusCode = 400;
        throw err;
      }
    }

    // Clinic-initiated cancellation rule is system-enforced to 100%
    if (
      cancellationPolicy.clinicCancellationRefundPercentage !== undefined &&
      Number(cancellationPolicy.clinicCancellationRefundPercentage) !== 100
    ) {
      const err = new Error('Clinic-initiated cancellation must always provide a 100% refund of the applicable deposit.');
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * Helper to update policies with audit logging
 */
async function updateClinicPoliciesHandler(req, res, next) {
  try {
    validatePoliciesPayload(req.body);

    const clinicId = req.staffUser?.clinicId;
    if (!clinicId) {
      return res.status(400).json({ success: false, error: 'Staff user is not associated with a clinic.' });
    }

    const clinic = await Clinic.findById(clinicId);
    if (!clinic) {
      return res.status(404).json({ success: false, error: 'Clinic configuration not found.' });
    }

    const previousPolicy = {
      depositPolicy: clinic.depositPolicy?.toObject ? clinic.depositPolicy.toObject() : { ...clinic.depositPolicy },
      cancellationPolicy: clinic.cancellationPolicy?.toObject ? clinic.cancellationPolicy.toObject() : { ...clinic.cancellationPolicy },
    };

    const { settings, depositPolicy, cancellationPolicy } = req.body;

    if (settings) {
      clinic.settings = { ...clinic.settings, ...settings };
    }

    if (depositPolicy) {
      if (depositPolicy.enabled !== undefined) {
        clinic.depositPolicy.enabled = Boolean(depositPolicy.enabled);
      }
      if (depositPolicy.defaultAmount !== undefined) {
        const amt = Number(depositPolicy.defaultAmount);
        clinic.depositPolicy.defaultAmount = amt;
        if (clinic.settings) {
          clinic.settings.defaultDepositAmount = amt;
        }
      }
      // Walk-ins must continue to require 0 advance deposit
      clinic.depositPolicy.walkInRequiresDeposit = false;
    }

    if (cancellationPolicy) {
      if (cancellationPolicy.deadlineHours !== undefined) {
        clinic.cancellationPolicy.deadlineHours = Number(cancellationPolicy.deadlineHours);
      }
      if (cancellationPolicy.refundPercentageBeforeDeadline !== undefined) {
        const pct = Number(cancellationPolicy.refundPercentageBeforeDeadline);
        clinic.cancellationPolicy.refundPercentageBeforeDeadline = pct;
        clinic.cancellationPolicy.refundPercentage = pct; // Legacy alias
      }
      if (cancellationPolicy.refundPercentageAfterDeadline !== undefined) {
        clinic.cancellationPolicy.refundPercentageAfterDeadline = Number(cancellationPolicy.refundPercentageAfterDeadline);
      }
      // Strictly enforced: Clinic-initiated cancellation is always 100%
      clinic.cancellationPolicy.clinicCancellationRefundPercentage = 100;
    }

    await clinic.save();

    // Create immutable audit entry
    await AuditLog.create({
      clinicId: clinic._id,
      actorId: req.staffUser._id,
      actorRole: req.staffUser.role,
      action: 'CLINIC_POLICY_UPDATED',
      entityType: 'Clinic',
      entityId: clinic._id.toString(),
      details: {
        previous: previousPolicy,
        new: {
          depositPolicy: clinic.depositPolicy,
          cancellationPolicy: clinic.cancellationPolicy,
        },
      },
    });

    res.json({
      success: true,
      message: 'Clinic policies updated successfully.',
      data: {
        depositPolicy: clinic.depositPolicy,
        cancellationPolicy: clinic.cancellationPolicy,
        settings: clinic.settings,
      },
    });
  } catch (err) {
    next(err);
  }
}

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
 * GET /api/v1/clinic/policies
 * Returns active deposit and cancellation policies
 */
router.get('/policies', async (req, res, next) => {
  try {
    const clinic = await Clinic.findOne({ isActive: true });
    if (!clinic) {
      return res.status(404).json({ success: false, error: 'Clinic configuration not found.' });
    }

    res.json({
      success: true,
      data: {
        depositPolicy: clinic.depositPolicy,
        cancellationPolicy: clinic.cancellationPolicy,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/clinic/settings
 * Owner only: updates clinic operational settings and policies
 */
router.patch('/settings', requireStaffAuth, requireRole(STAFF_ROLES.CLINIC_OWNER), updateClinicPoliciesHandler);

/**
 * PATCH /api/v1/clinic/policies
 * Owner only: updates clinic deposit and cancellation policies
 */
router.patch('/policies', requireStaffAuth, requireRole(STAFF_ROLES.CLINIC_OWNER), updateClinicPoliciesHandler);

export default router;
