// Simple in-memory rate limiter for API routes
// For production scale, consider Redis or a dedicated rate limiting service

const rateLimit = new Map();

/**
 * Rate limiter middleware
 * @param {string} identifier - Unique identifier (IP, user ID, etc.)
 * @param {number} maxRequests - Maximum requests allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Object} { success: boolean, remaining: number, resetTime: number }
 */
export function checkRateLimit(identifier, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const userLimit = rateLimit.get(identifier);

  // Clean up old entries periodically (simple cleanup)
  if (rateLimit.size > 10000) {
    const cutoff = now - windowMs;
    for (const [key, value] of rateLimit.entries()) {
      if (value.resetTime < cutoff) {
        rateLimit.delete(key);
      }
    }
  }

  if (!userLimit) {
    // First request from this identifier
    rateLimit.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    };
  }

  // Check if window has expired
  if (now > userLimit.resetTime) {
    // Reset the window
    rateLimit.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    };
  }

  // Within the window
  if (userLimit.count >= maxRequests) {
    // Rate limit exceeded
    return {
      success: false,
      remaining: 0,
      resetTime: userLimit.resetTime,
    };
  }

  // Increment count
  userLimit.count += 1;
  rateLimit.set(identifier, userLimit);

  return {
    success: true,
    remaining: maxRequests - userLimit.count,
    resetTime: userLimit.resetTime,
  };
}

/**
 * Get client IP from request
 * Handles common proxy headers
 */
export function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const real = req.headers['x-real-ip'];

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (real) {
    return real;
  }

  return req.socket?.remoteAddress || 'unknown';
}
