/**
 * Razorpay Configuration & Environment Resolver
 *
 * Enforces strict separation between Test and Live modes:
 * - Test mode (default): Uses RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 * - Live mode: Requires explicit RAZORPAY_MODE=live (or RAZORPAY_ENV=live) AND
 *   RAZORPAY_LIVE_KEY_ID, RAZORPAY_LIVE_KEY_SECRET, RAZORPAY_LIVE_WEBHOOK_SECRET.
 *
 * Safety Invariants:
 * - Test mode is ALWAYS the default unless explicitly set to 'live'.
 * - Live mode requires key prefix `rzp_live_`.
 * - Test mode blocks any key prefix starting with `rzp_live_`.
 * - Key secrets never leave the backend.
 * - Secrets are never logged or exposed in client responses or audit logs.
 * - Never mix Test orders with Live payment verification.
 */

import { logger } from '../shared/logger.js';

export const RAZORPAY_MODES = {
  TEST: 'test',
  LIVE: 'live',
};

/**
 * Validates Razorpay credentials for the requested mode.
 * Throws a descriptive configuration error if credentials are missing or mismatched.
 *
 * @param {Object} config - Configuration object to validate
 * @returns {boolean} true if valid
 */
export function validateRazorpayConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('[RAZORPAY CONFIG] Configuration object is required.');
  }

  const { mode, keyId, keySecret, webhookSecret } = config;

  if (mode === RAZORPAY_MODES.LIVE) {
    if (!keyId || typeof keyId !== 'string' || keyId.trim() === '') {
      throw new Error(
        '[RAZORPAY CONFIG] Live mode is active (RAZORPAY_MODE=live), but RAZORPAY_LIVE_KEY_ID is missing.'
      );
    }

    if (keyId.startsWith('rzp_test_')) {
      throw new Error(
        '[RAZORPAY CONFIG] Mismatched credentials: Live mode is active but key ID begins with "rzp_test_". Test keys cannot be used in Live mode!'
      );
    }

    if (!keyId.startsWith('rzp_live_')) {
      throw new Error(
        `[RAZORPAY CONFIG] Invalid Live Key ID: Live key ID must begin with "rzp_live_". Received prefix: ${keyId.substring(0, 8)}...`
      );
    }

    if (!keySecret || typeof keySecret !== 'string' || keySecret.trim() === '') {
      throw new Error(
        '[RAZORPAY CONFIG] Live mode is active (RAZORPAY_MODE=live), but RAZORPAY_LIVE_KEY_SECRET is missing.'
      );
    }

    if (!webhookSecret || typeof webhookSecret !== 'string' || webhookSecret.trim() === '') {
      throw new Error(
        '[RAZORPAY CONFIG] Live mode is active (RAZORPAY_MODE=live), but RAZORPAY_LIVE_WEBHOOK_SECRET is missing. Webhooks cannot be safely verified without a live webhook secret.'
      );
    }
  } else {
    // Test mode
    if (keyId && keyId.startsWith('rzp_live_')) {
      throw new Error(
        '[RAZORPAY CONFIG] Mismatched credentials: Test mode is active (RAZORPAY_MODE=test) but key ID begins with "rzp_live_". Live credentials must NEVER be used in Test mode!'
      );
    }
  }

  return true;
}

/**
 * Resolves active Razorpay configuration based on environment variables.
 * Test mode is ALWAYS the default unless RAZORPAY_MODE=live or RAZORPAY_ENV=live.
 *
 * @param {Object} [envOverride] - Optional environment variable dictionary for testing
 * @returns {Object} Active Razorpay configuration
 */
export function getRazorpayConfig(envOverride) {
  const env = envOverride || process.env;

  const rawMode = (env.RAZORPAY_MODE || env.RAZORPAY_ENV || 'test').toLowerCase().trim();
  const isLive = rawMode === 'live';
  const mode = isLive ? RAZORPAY_MODES.LIVE : RAZORPAY_MODES.TEST;

  let keyId;
  let keySecret;
  let webhookSecret;

  if (isLive) {
    keyId = env.RAZORPAY_LIVE_KEY_ID || env.RAZORPAY_KEY_ID || '';
    keySecret = env.RAZORPAY_LIVE_KEY_SECRET || env.RAZORPAY_KEY_SECRET || '';
    webhookSecret = env.RAZORPAY_LIVE_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET || '';
  } else {
    // Test mode defaults to local fallback keys for testing
    keyId = env.RAZORPAY_KEY_ID || 'rzp_test_aarogyam';
    keySecret = env.RAZORPAY_KEY_SECRET || 'test_secret_key_aarogyam_123';
    webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_aarogyam_456';
  }

  const config = {
    mode,
    isLive,
    keyId,
    keySecret,
    webhookSecret,
  };

  validateRazorpayConfig(config);

  return config;
}

/**
 * Returns safe public configuration suitable for sending to the client browser.
 * Never includes keySecret or webhookSecret.
 *
 * @returns {{ mode: string, keyId: string }}
 */
export function getPublicRazorpayConfig() {
  const config = getRazorpayConfig();
  return {
    mode: config.mode,
    keyId: config.keyId,
  };
}

/**
 * Mask secret strings for secure audit logging.
 *
 * @param {string} str - Secret string to mask
 * @returns {string} Masked string (e.g. "***a1b2")
 */
export function maskCredential(str) {
  if (!str || typeof str !== 'string') return '(empty)';
  if (str.length <= 4) return '***';
  return '***' + str.slice(-4);
}

