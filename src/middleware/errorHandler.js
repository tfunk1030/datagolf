/**
 * Global Error Handler Middleware
 * Provides centralized error handling with proper logging and response formatting
 * Handles different error types with appropriate HTTP status codes
 */

const { logError } = require('../utils/logger');
const { getConfig } = require('../config/environment');

/**
 * Custom error classes for different error types
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.field = field;
  }
}

class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized access') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
  }
}

class ForbiddenError extends Error {
  constructor(message = 'Forbidden access') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
  }
}

class ConflictError extends Error {
  constructor(message = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
  }
}

class DatabaseError extends Error {
  constructor(message = 'Database operation failed') {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 500;
  }
}

class CacheError extends Error {
  constructor(message = 'Cache operation failed') {
    super(message);
    this.name = 'CacheError';
    this.statusCode = 500;
  }
}

/**
 * Determine HTTP status code from error
 * @param {Error} error - Error object
 * @returns {number} HTTP status code
 */
function getStatusCode(error) {
  if (error.statusCode) {
    return error.statusCode;
  }

  // Handle specific error types
  switch (error.name) {
    case 'ValidationError':
    case 'CastError':
      return 400;
    case 'UnauthorizedError':
    case 'JsonWebTokenError':
      return 401;
    case 'ForbiddenError':
      return 403;
    case 'NotFoundError':
      return 404;
    case 'ConflictError':
      return 409;
    case 'RateLimitError':
      return 429;
    case 'DatabaseError':
    case 'CacheError':
      return 500;
    default:
      return 500;
  }
}

/**
 * Format error response based on environment
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @returns {Object} Formatted error response
 */
function formatErrorResponse(error, req) {
  const config = getConfig();
  const statusCode = getStatusCode(error);

  const baseResponse = {
    error: true,
    message: error.message || 'Internal server error',
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  // Add request ID if available
  if (req.id) {
    baseResponse.requestId = req.id;
  }

  // Add validation field if available
  if (error.field) {
    baseResponse.field = error.field;
  }

  // Include stack trace in development
  if (config.isDevelopment && error.stack) {
    baseResponse.stack = error.stack;
  }

  // Include error details for specific error types
  if (error.name === 'ValidationError' && error.details) {
    baseResponse.details = error.details;
  }

  return baseResponse;
}

/**
 * Global error handler middleware
 * @param {Error} error - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function errorHandler(error, req, res, next) {
  // If response already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = getStatusCode(error);
  const errorResponse = formatErrorResponse(error, req);

  // Log error with context
  logError(error, {
    statusCode,
    path: req.originalUrl,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    sessionId: req.sessionId,
    requestId: req.id
  });

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create error with specific type
 * @param {string} type - Error type
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 * @returns {Error} Error instance
 */
function createError(type, message, options = {}) {
  const errorClasses = {
    validation: ValidationError,
    notFound: NotFoundError,
    unauthorized: UnauthorizedError,
    forbidden: ForbiddenError,
    conflict: ConflictError,
    rateLimit: RateLimitError,
    database: DatabaseError,
    cache: CacheError
  };

  const ErrorClass = errorClasses[type] || Error;
  const error = new ErrorClass(message);

  // Add additional properties
  Object.assign(error, options);

  return error;
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  DatabaseError,
  CacheError
};
