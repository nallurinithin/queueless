import { Router } from 'express';
import { patientAuthService } from '../services/patientAuthService.js';
import { requirePatientAuth } from '../shared/middleware/auth.js';
import { Clinic } from '../models/index.js';

const router = Router();

// Helper to resolve active clinic (V1 single clinic tenant)
async function getActiveClinicId() {
  let clinic = await Clinic.findOne({ isActive: true });
  if (!clinic) {
    clinic = await Clinic.findOne({});
  }
  return clinic ? clinic._id : null;
}

/**
 * POST /api/v1/patient/auth/request-otp
 */
router.post('/request-otp', async (req, res, next) => {
  try {
    const { phone } = req.body;
    const clinicId = await getActiveClinicId();

    const result = await patientAuthService.requestOtp({ phone, clinicId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/patient/auth/verify-otp
 * Verifies OTP, establishes persistent session, and sets HttpOnly cookie
 */
router.post('/verify-otp', async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const clinicId = await getActiveClinicId();
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.socket.remoteAddress || '';

    const result = await patientAuthService.verifyOtp({
      phone,
      otp,
      clinicId,
      userAgent,
      ipAddress,
    });

    // Set secure HttpOnly session cookie
    res.cookie('queueless_patient_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: result.expiresAt,
    });

    res.json({
      success: true,
      data: {
        contact: result.bookingContact,
        linkedPatients: result.linkedPatients,
        token: result.sessionToken,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/patient/auth/session
 * Restores session on page refresh without requesting OTP again
 */
router.get('/session', async (req, res, next) => {
  try {
    const sessionToken =
      req.cookies?.queueless_patient_session ||
      req.headers['x-patient-session'] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (!sessionToken) {
      return res.json({ success: true, authenticated: false, session: null });
    }

    const clinicId = await getActiveClinicId();
    const result = await patientAuthService.getActiveSession({ sessionToken, clinicId });

    if (!result) {
      res.clearCookie('queueless_patient_session');
      return res.json({ success: true, authenticated: false, session: null });
    }

    // Refresh cookie expiry on client as well
    res.cookie('queueless_patient_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: result.expiresAt,
    });

    res.json({
      success: true,
      authenticated: true,
      data: {
        contact: result.bookingContact,
        linkedPatients: result.linkedPatients,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/patient/auth/family-members
 * Adds a new family member under this verified booking contact
 */
router.post('/family-members', requirePatientAuth, async (req, res, next) => {
  try {
    const { fullName, gender, age, relationship } = req.body;

    const newPatient = await patientAuthService.addFamilyMember({
      bookingContactId: req.bookingContact._id,
      clinicId: req.clinicId,
      fullName,
      gender,
      age,
      relationship,
    });

    res.status(201).json({
      success: true,
      message: 'Family member profile created successfully.',
      data: newPatient,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/patient/auth/logout
 */
router.post('/logout', async (req, res, next) => {
  try {
    const sessionToken =
      req.cookies?.queueless_patient_session ||
      req.headers['x-patient-session'] ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    await patientAuthService.logout(sessionToken);
    res.clearCookie('queueless_patient_session');
    res.json({ success: true, message: 'Patient session terminated successfully.' });
  } catch (err) {
    next(err);
  }
});

export default router;
