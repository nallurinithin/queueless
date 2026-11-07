/**
 * Environment Variable Validation
 *
 * Validates and exports all required environment variables at startup.
 * Fails fast with a clear message if any required variable is missing.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  // Database
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // Session / JWT
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  // CORS
  ALLOWED_ORIGINS: z.string().optional().default('http://localhost:5173'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Razorpay Payment Gateway Mode & Credentials
  RAZORPAY_MODE: z.enum(['test', 'live']).default('test'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_LIVE_KEY_ID: z.string().optional(),
  RAZORPAY_LIVE_KEY_SECRET: z.string().optional(),
  RAZORPAY_LIVE_WEBHOOK_SECRET: z.string().optional(),
});

let _env;

/**
 * Validates environment variables against the schema.
 * Caches the result after first successful validation.
 * @returns {z.infer<typeof envSchema>} Validated environment object
 */
export function validateEnv() {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(
      '\n✗ Environment validation failed:\n' +
      errors +
      '\n\nCopy .env.example to .env and fill in the required values.\n'
    );
    process.exit(1);
  }

  _env = Object.freeze(result.data);
  return _env;
}

