/**
 * Not Found Handler
 *
 * Catches unhandled routes and returns a standardized 404 response.
 */

export function notFoundHandler(req, res, _next) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
}

