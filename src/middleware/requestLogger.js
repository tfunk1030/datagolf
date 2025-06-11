/**
 * Request Logger Middleware
 * Logs HTTP requests with performance metrics and context
 * Provides request tracking and analytics data collection
 */

const { v4: uuidv4 } = require('uuid');
const { logRequest } = require('../utils/logger');
const { getConfig } = require('../config/environment');

/**
 * Generate unique request ID
 * @returns {string} Unique request identifier
 */
function generateRequestId() {
  return uuidv4();
}

/**
 * Extract client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIp(req) {
  return req.ip ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         'unknown';
}

/**
 * Extract user agent information
 * @param {Object} req - Express request object
 * @returns {Object} Parsed user agent data
 */
function getUserAgent(req) {
  const userAgent = req.get('User-Agent') || 'unknown';

  // Basic user agent parsing
  const isBot = /bot|crawler|spider|scraper/i.test(userAgent);
  const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
  const isDesktop = !isMobile && !isBot;

  return {
    raw: userAgent,
    isBot,
    isMobile,
    isDesktop
  };
}

/**
 * Determine if request should be logged
 * @param {Object} req - Express request object
 * @returns {boolean} Whether to log the request
 */
function shouldLogRequest(req) {
  const config = getConfig();

  // Skip logging for health checks in production
  if (config.isProduction && req.path === '/health') {
    return false;
  }

  // Skip logging for static assets in production
  if (config.isProduction && /\.(css|js|png|jpg|jpeg|gif|ico|svg)$/.test(req.path)) {
    return false;
  }

  // Skip logging for preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return false;
  }

  return true;
}

/**
 * Extract request size information
 * @param {Object} req - Express request object
 * @returns {Object} Request size data
 */
function getRequestSize(req) {
  const contentLength = req.get('Content-Length');
  return {
    contentLength: contentLength ? parseInt(contentLength, 10) : 0,
    hasBody: req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE'
  };
}

/**
 * Extract response size information
 * @param {Object} res - Express response object
 * @returns {Object} Response size data
 */
function getResponseSize(res) {
  const contentLength = res.get('Content-Length');
  return {
    contentLength: contentLength ? parseInt(contentLength, 10) : 0
  };
}

/**
 * Request logger middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requestLogger(req, res, next) {
  const config = getConfig();
  const startTime = Date.now();

  // Generate unique request ID
  req.id = generateRequestId();
  req.startTime = startTime;

  // Extract request information
  const clientIp = getClientIp(req);
  const userAgent = getUserAgent(req);
  const requestSize = getRequestSize(req);

  // Add request context to req object
  req.context = {
    id: req.id,
    startTime,
    clientIp,
    userAgent,
    requestSize
  };

  // Set request ID header for client tracking
  res.set('X-Request-ID', req.id);

  // Skip logging if not needed
  if (!shouldLogRequest(req)) {
    return next();
  }

  // Override res.end to capture response metrics
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const responseSize = getResponseSize(res);

    // Restore original end function
    res.end = originalEnd;

    // Call original end function
    res.end(chunk, encoding);

    // Log request with metrics
    const logData = {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      clientIp,
      userAgent: userAgent.raw,
      isBot: userAgent.isBot,
      isMobile: userAgent.isMobile,
      requestSize: requestSize.contentLength,
      responseSize: responseSize.contentLength,
      referer: req.get('Referer') || null,
      sessionId: req.sessionId || null,
      timestamp: new Date(startTime).toISOString()
    };

    // Add query parameters for GET requests
    if (req.method === 'GET' && Object.keys(req.query).length > 0) {
      logData.queryParams = req.query;
    }

    // Add performance classification
    if (duration > 5000) {
      logData.performance = 'very_slow';
    } else if (duration > 2000) {
      logData.performance = 'slow';
    } else if (duration > 500) {
      logData.performance = 'moderate';
    } else {
      logData.performance = 'fast';
    }

    // Log the request
    logRequest(req, res, duration);

    // Store analytics data for batch processing
    if (config.analytics && config.analytics.enabled !== false) {
      req.analyticsData = logData;
    }
  };

  next();
}

/**
 * Request timing middleware for detailed performance tracking
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requestTiming(req, res, next) {
  if (!req.timings) {
    req.timings = {};
  }

  req.timings.start = process.hrtime.bigint();

  // Add timing helper function
  req.addTiming = function(label) {
    const now = process.hrtime.bigint();
    const duration = Number(now - req.timings.start) / 1000000; // Convert to milliseconds
    req.timings[label] = duration;
  };

  next();
}

/**
 * Security headers middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function securityHeaders(req, res, next) {
  // Add security headers
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });

  next();
}

/**
 * Request correlation middleware for distributed tracing
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function requestCorrelation(req, res, next) {
  // Extract correlation ID from headers or generate new one
  const correlationId = req.get('X-Correlation-ID') ||
                       req.get('X-Request-ID') ||
                       req.id ||
                       generateRequestId();

  req.correlationId = correlationId;
  res.set('X-Correlation-ID', correlationId);

  next();
}

module.exports = {
  requestLogger,
  requestTiming,
  securityHeaders,
  requestCorrelation,
  generateRequestId,
  getClientIp,
  getUserAgent,
  shouldLogRequest
};
