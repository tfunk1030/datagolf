/**
 * Winston Logger Configuration
 * Provides structured logging with different levels and transports
 * Supports file and console logging based on environment
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { getConfig } = require('../config/environment');

/**
 * Create log directory if it doesn't exist
 * @param {string} logPath - Path to log file
 */
function ensureLogDirectory(logPath) {
  if (!logPath) return;

  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * Custom log format for structured logging
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logEntry = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      logEntry += ` ${JSON.stringify(meta)}`;
    }

    return logEntry;
  })
);

/**
 * Console format for development
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let logEntry = `${timestamp} ${level}: ${message}`;

    if (Object.keys(meta).length > 0) {
      logEntry += ` ${JSON.stringify(meta, null, 2)}`;
    }

    return logEntry;
  })
);

/**
 * Create logger instance based on environment configuration
 * @returns {Object} Winston logger instance
 */
function createLogger() {
  const config = getConfig();
  const transports = [];

  // Console transport for all environments
  transports.push(
    new winston.transports.Console({
      level: config.isDevelopment ? 'debug' : config.logging.level,
      format: config.isDevelopment ? consoleFormat : logFormat,
      handleExceptions: true,
      handleRejections: true
    })
  );

  // File transport for non-testing environments
  if (config.logging.file && !config.isTesting) {
    ensureLogDirectory(config.logging.file);

    transports.push(
      new winston.transports.File({
        filename: config.logging.file,
        level: config.logging.level,
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
        handleExceptions: true,
        handleRejections: true
      })
    );

    // Separate error log file
    const errorLogPath = config.logging.file.replace('.log', '.error.log');
    transports.push(
      new winston.transports.File({
        filename: errorLogPath,
        level: 'error',
        format: logFormat,
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 3,
        tailable: true
      })
    );
  }

  return winston.createLogger({
    level: config.logging.level,
    format: logFormat,
    transports,
    exitOnError: false,
    silent: config.isTesting && process.env.LOG_LEVEL !== 'debug'
  });
}

// Create and export logger instance
const logger = createLogger();

/**
 * Log request information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} duration - Request duration in milliseconds
 */
function logRequest(req, res, duration) {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    sessionId: req.sessionId
  };

  if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
}

/**
 * Log error with context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
function logError(error, context = {}) {
  logger.error('Application Error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context
  });
}

/**
 * Log cache operations
 * @param {string} operation - Cache operation (hit, miss, set, delete)
 * @param {string} key - Cache key
 * @param {Object} metadata - Additional metadata
 */
function logCache(operation, key, metadata = {}) {
  logger.debug('Cache Operation', {
    operation,
    key,
    ...metadata
  });
}

/**
 * Log database operations
 * @param {string} operation - Database operation
 * @param {string} table - Database table
 * @param {Object} metadata - Additional metadata
 */
function logDatabase(operation, table, metadata = {}) {
  logger.debug('Database Operation', {
    operation,
    table,
    ...metadata
  });
}

/**
 * Log analytics events
 * @param {string} event - Analytics event type
 * @param {Object} data - Event data
 */
function logAnalytics(event, data = {}) {
  logger.info('Analytics Event', {
    event,
    ...data
  });
}

module.exports = {
  // Winston logger methods
  info: logger.info.bind(logger),
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  debug: logger.debug.bind(logger),
  verbose: logger.verbose.bind(logger),
  silly: logger.silly.bind(logger),
  log: logger.log.bind(logger),

  // Custom logging functions
  logRequest,
  logError,
  logCache,
  logDatabase,
  logAnalytics,
  createLogger
};
