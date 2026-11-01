import crypto from 'crypto';
import { StaffSession, StaffUser, STAFF_STATUS, PatientSession, BookingContact } from '../../models/index.js';

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Require Authenticated Staff Session
 */
export async function requireStaffAuth(req, res, next) {
  try {
    const rawToken =
      req.cookies?.queueless_staff_session ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (!rawToken) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please sign in to the staff portal.',
      });
    }

    const tokenHash = hashToken(rawToken);
    const session = await StaffSession.findOne({
      sessionTokenHash: tokenHash,
      expiresAt: { $gt: new Date() },
      revokedAt: null,
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired staff session.',
      });
    }

    const staffUser = await StaffUser.findById(session.staffUserId);
    if (!staffUser || staffUser.status !== STAFF_STATUS.ACTIVE) {
      return res.status(403).json({
        success: false,
        error: 'Staff account is inactive or has been deactivated.',
      });
    }

    req.staffUser = staffUser;
    req.clinicId = staffUser.clinicId;
    req.staffSession = session;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Require Specific Staff Roles (RBAC)
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.staffUser) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.staffUser.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Insufficient privileges for this action.',
      });
    }

    next();
  };
}

/**
 * Require Authenticated Patient Session
 */
export async function requirePatientAuth(req, res, next) {
  try {
    const rawToken =
      req.cookies?.queueless_patient_session ||
      req.headers['x-patient-session'] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (!rawToken) {
      return res.status(401).json({
        success: false,
        error: 'Patient verification required. Please verify your mobile number with OTP.',
      });
    }

    const tokenHash = hashToken(rawToken);
    const session = await PatientSession.findOne({
      sessionTokenHash: tokenHash,
      expiresAt: { $gt: new Date() },
      absoluteExpiresAt: { $gt: new Date() },
      revokedAt: null,
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'Patient session expired or revoked. Please verify OTP again.',
      });
    }

    const bookingContact = await BookingContact.findById(session.bookingContactId);
    if (!bookingContact) {
      return res.status(401).json({
        success: false,
        error: 'Associated contact profile not found.',
      });
    }

    // Refresh rolling idle expiration (7 days from now, up to absolute cap)
    const rollingIdle = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    session.expiresAt = rollingIdle < session.absoluteExpiresAt ? rollingIdle : session.absoluteExpiresAt;
    session.lastActivityAt = new Date();
    await session.save();

    req.bookingContact = bookingContact;
    req.clinicId = session.clinicId;
    req.patientSession = session;
    next();
  } catch (err) {
    next(err);
  }
}
