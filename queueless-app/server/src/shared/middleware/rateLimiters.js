/**
 * Dedicated Rate Limiters for High-Risk and Public Endpoints
 */

import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

/**
 * Patient OTP Request Limiter
 * Guards against SMS toll fraud and recipient SMS bombing.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    if (isTest) return req.headers['x-test-rate-limit'] ? 3 : 500;
    return 10;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many OTP requests. Please wait 15 minutes before requesting another code.',
    code: 'RATE_LIMITED',
  },
});

/**
 * Patient OTP Verify Limiter
 * Guards against automated OTP enumeration.
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    if (isTest) return req.headers['x-test-rate-limit'] ? 3 : 500;
    return 20;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many verification attempts. Please wait 15 minutes before trying again.',
    code: 'RATE_LIMITED',
  },
});

/**
 * Staff Login Limiter
 * Guards against brute-force credential stuffing attacks.
 */
export const staffLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    if (isTest) return req.headers['x-test-rate-limit'] ? 3 : 500;
    return 15;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many staff login attempts. Please wait 15 minutes before retrying.',
    code: 'RATE_LIMITED',
  },
});

/**
 * Staff Password Reset Limiter
 */
export const staffForgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => {
    if (isTest) return req.headers['x-test-rate-limit'] ? 3 : 500;
    return 5;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many password reset requests. Please wait 15 minutes.',
    code: 'RATE_LIMITED',
  },
});

