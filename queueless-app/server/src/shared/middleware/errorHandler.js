/**
 * Global Error Handler
 *
 * Catches unhandled errors thrown during request processing,
 * logs the incident, and returns a sanitized JSON response.
 * Never leaks stack traces or secrets to the client.
 */

import { logger } from '../logger.js';

export function errorHandler(err, req, res, _next) {
  logger.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);

  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: isProduction && status === 500 
        ? 'An unexpected error occurred. Please try again later.'
        : err.message,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  });
}

