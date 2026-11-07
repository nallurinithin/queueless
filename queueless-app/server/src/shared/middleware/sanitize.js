/**
 * NoSQL Injection & Input Sanitization Middleware
 *
 * Inspects req.query, req.body, and req.params for dangerous MongoDB query operators
 * ($ prefix or . in property names) and rejects them immediately with 400 Bad Request.
 * Also provides helper sanitizers for scalar and ObjectId parameters.
 */

function hasMongoOperators(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const [key, value] of Object.entries(obj)) {
    if (key.includes('$') || key.includes('.')) {
      return true;
    }
    if (typeof value === 'object' && value !== null) {
      if (hasMongoOperators(value)) {
        return true;
      }
    }
  }
  return false;
}

export function sanitizeNoSql(req, res, next) {
  if (hasMongoOperators(req.query) || hasMongoOperators(req.body) || hasMongoOperators(req.params)) {
    return res.status(400).json({
      success: false,
      error: 'Malformed input: Query operators are not permitted.',
      code: 'BAD_REQUEST',
    });
  }
  next();
}
