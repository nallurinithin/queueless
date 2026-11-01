import { Router } from 'express';
import { staffAuthService } from '../services/staffAuthService.js';
import { requireStaffAuth } from '../shared/middleware/auth.js';

const router = Router();

/**
 * POST /api/v1/staff/auth/login
 * Unified login endpoint. Accepts { email, password }.
 * Returns user profile, role, redirect path, and sets HttpOnly cookie.
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress = req.ip || req.socket.remoteAddress || '';

    const result = await staffAuthService.login(email, password, { userAgent, ipAddress });

    // Set secure HttpOnly session cookie
    res.cookie('queueless_staff_session', result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: result.expiresAt,
    });

    res.json({
      success: true,
      user: result.staffUser,
      token: result.sessionToken,
      redirectPath: result.redirectPath,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/auth/logout
 */
router.post('/logout', requireStaffAuth, async (req, res, next) => {
  try {
    const rawToken =
      req.cookies?.queueless_staff_session ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    await staffAuthService.logout(rawToken);

    res.clearCookie('queueless_staff_session');
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/staff/auth/me
 * Returns current authenticated staff user
 */
router.get('/me', requireStaffAuth, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.staffUser._id.toString(),
      name: req.staffUser.name,
      email: req.staffUser.email,
      role: req.staffUser.role,
      clinicId: req.staffUser.clinicId.toString(),
      status: req.staffUser.status,
    },
  });
});

/**
 * POST /api/v1/staff/auth/activate
 * Accepts { token, password }
 */
router.post('/activate', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const result = await staffAuthService.activateAccount({ token, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/auth/forgot-password
 * Accepts { email }
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await staffAuthService.requestPasswordReset(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/staff/auth/reset-password
 * Accepts { token, newPassword }
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const result = await staffAuthService.resetPassword({ token, newPassword });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
