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

  // Convert Mongoose ObjectId CastError into safe 400 Bad Request
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid identifier format for parameter: ${err.path || 'id'}`,
      code: 'BAD_REQUEST',
    });
  }

  const status = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  const errorMessage =
    isProduction && status === 500
      ? 'An unexpected error occurred. Please try again later.'
      : err.message || 'Internal Server Error';

  res.status(status).json({
    success: false,
    error: errorMessage,
    code:
      err.code ||
      (status === 401
        ? 'UNAUTHORIZED'
        : status === 403
        ? 'FORBIDDEN'
        : status === 404
        ? 'NOT_FOUND'
        : status === 409
        ? 'CONFLICT'
        : status === 429
        ? 'RATE_LIMITED'
        : 'BAD_REQUEST'),
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
