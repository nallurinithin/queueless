import { Router } from 'express';
import { staffAuthService } from '../services/staffAuthService.js';
import { requireStaffAuth, requireRole } from '../shared/middleware/auth.js';
import {
  StaffUser,
  STAFF_ROLES,
  STAFF_STATUS,
  StaffInvitationToken,
  QueueEntry,
  QUEUE_STATUS,
  Department,
} from '../models/index.js';

const router = Router();

// Protect all management endpoints to Clinic Owner only
router.use(requireStaffAuth, requireRole(STAFF_ROLES.CLINIC_OWNER));

/**
 * GET /api/v1/staff/metrics
 * Returns genuine, real-time daily metrics for the clinic owner dashboard
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todayEntries = await QueueEntry.find({
      clinicId: req.clinicId,
      queueDate: today,
    });

    const totalConsultations = todayEntries.filter((e) => e.queueStatus === QUEUE_STATUS.COMPLETED).length;
    const walkIns = todayEntries.filter((e) => e.entryType === 'WALK_IN').length;
    const onlineBookings = todayEntries.filter((e) => e.entryType !== 'WALK_IN').length;

    let avgWaitMins = 0;
    const completed = todayEntries.filter((e) => e.completedAt && e.checkedInAt);
    if (completed.length > 0) {
      const totalWait = completed.reduce(
        (sum, e) => sum + (new Date(e.servingAt || e.completedAt) - new Date(e.checkedInAt)),
        0
      );
      avgWaitMins = Math.round(totalWait / (completed.length * 60000));
    }

    res.json({
      success: true,
      data: {
        totalConsultationsToday: totalConsultations,
        averageWaitTimeMins: avgWaitMins,
        totalWalkIns: walkIns,
        onlineBookings: onlineBookings,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/staff/members
 * Lists all staff members in the clinic
 */
router.get('/members', async (req, res, next) => {
  try {
    const staff = await StaffUser.find({ clinicId: req.clinicId })
      .select('-passwordHash')
      .populate('departmentIds', 'name code')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: staff.map((s) => ({
        id: s._id.toString(),
        name: s.name,
        email: s.email,
        phone: s.phone,
        role: s.role,
        status: s.status,
        departments: s.departmentIds,
        lastLoginAt: s.lastLoginAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/invitations
 * Owner invites a new doctor or receptionist
 */
router.post('/invitations', async (req, res, next) => {
  try {
    const { name, email, role, phone, departmentIds, departmentName } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ success: false, error: 'Name, email, and role are required.' });
    }

    if (![STAFF_ROLES.DOCTOR, STAFF_ROLES.RECEPTIONIST].includes(role)) {
      return res.status(400).json({ success: false, error: 'Only Doctor and Receptionist roles can be invited.' });
    }

    let finalDeptIds = [];
    if (role === STAFF_ROLES.DOCTOR) {
      if (departmentName) {
        const dept = await Department.findOne({
          clinicId: req.clinicId,
          name: new RegExp(`^${departmentName}$`, 'i'),
        });
        if (dept) {
          finalDeptIds = [dept._id];
        }
      } else if (Array.isArray(departmentIds) && departmentIds.length > 0) {
        finalDeptIds = departmentIds;
      }
    } else if (role === STAFF_ROLES.RECEPTIONIST) {
      // Receptionist is clinic-wide across all departments
      finalDeptIds = [];
    }

    const result = await staffAuthService.inviteStaff({
      ownerUser: req.staffUser,
      clinicId: req.clinicId,
      name,
      email,
      role,
      phone,
      departmentIds: finalDeptIds,
    });

    res.status(201).json({
      success: true,
      message: `Invitation dispatched to ${email}.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/invitations/:id/resend
 */
router.post('/invitations/:id/resend', async (req, res, next) => {
  try {
    const result = await staffAuthService.resendInvitation({
      ownerUser: req.staffUser,
      clinicId: req.clinicId,
      staffUserId: req.params.id,
    });

    res.json({
      success: true,
      message: 'Invitation resent successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/staff/invitations/:id
 */
router.delete('/invitations/:id', async (req, res, next) => {
  try {
    await staffAuthService.revokeInvitation({
      ownerUser: req.staffUser,
      clinicId: req.clinicId,
      staffUserId: req.params.id,
    });

    res.json({
      success: true,
      message: 'Invitation revoked successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/staff/members/:id/status
 */
router.patch('/members/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (![STAFF_STATUS.ACTIVE, STAFF_STATUS.DEACTIVATED].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status.' });
    }

    const result = await staffAuthService.toggleStaffStatus({
      ownerUser: req.staffUser,
      clinicId: req.clinicId,
      staffUserId: req.params.id,
      newStatus: status,
    });

    res.json({
      success: true,
      message: `Staff member status updated to ${status}.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
