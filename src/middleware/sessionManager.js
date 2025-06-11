/**
 * Session Manager Middleware
 * Provides stateless session management with AES-256-GCM encryption
 * Handles session creation, validation, and cleanup without persistent storage
 */

const crypto = require('crypto');
const { getConfig } = require('../config/environment');
const { createError } = require('./errorHandler');
const logger = require('../utils/logger');

// Session configuration constants
const SESSION_HEADER = 'X-Session-ID';
const SESSION_COOKIE = 'golf_session';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;

/**
 * Generate cryptographically secure random bytes
 * @param {number} length - Number of bytes to generate
 * @returns {Buffer} Random bytes
 */
function generateSecureRandom(length) {
  return crypto.randomBytes(length);
}

/**
 * Derive encryption key from master key and salt
 * @param {string} masterKey - Master encryption key
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} Derived key
 */
function deriveKey(masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt session data using AES-256-GCM
 * @param {Object} data - Session data to encrypt
 * @param {string} masterKey - Master encryption key
 * @returns {string} Encrypted session token
 */
function encryptSessionData(data, masterKey) {
  try {
    const salt = generateSecureRandom(SALT_LENGTH);
    const iv = generateSecureRandom(IV_LENGTH);
    const key = deriveKey(masterKey, salt);

    const cipher = crypto.createCipher(ALGORITHM, key);
    cipher.setAAD(salt); // Additional authenticated data

    const jsonData = JSON.stringify(data);
    let encrypted = cipher.update(jsonData, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'hex')
    ]);

    return combined.toString('base64');
  } catch (error) {
    logger.error('Session encryption failed', { error: error.message });
    throw createError('unauthorized', 'Session encryption failed');
  }
}

/**
 * Decrypt session data using AES-256-GCM
 * @param {string} token - Encrypted session token
 * @param {string} masterKey - Master encryption key
 * @returns {Object} Decrypted session data
 */
function decryptSessionData(token, masterKey) {
  try {
    const combined = Buffer.from(token, 'base64');

    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(masterKey, salt);

    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(salt);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    logger.error('Session decryption failed', { error: error.message });
    throw createError('unauthorized', 'Invalid session token');
  }
}

/**
 * Create new session data
 * @param {Object} req - Express request object
 * @returns {Object} Session data
 */
function createSessionData(req) {
  const now = Date.now();
  const sessionId = crypto.randomUUID();

  return {
    id: sessionId,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + SESSION_TIMEOUT,
    userAgent: req.get('User-Agent') || 'unknown',
    clientIp: req.ip || 'unknown',
    preferences: {},
    analytics: {
      requestCount: 0,
      lastRequestAt: now
    }
  };
}

/**
 * Validate session data
 * @param {Object} sessionData - Session data to validate
 * @returns {boolean} Whether session is valid
 */
function isSessionValid(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') {
    return false;
  }

  const now = Date.now();

  // Check required fields
  if (!sessionData.id || !sessionData.createdAt || !sessionData.expiresAt) {
    return false;
  }

  // Check expiration
  if (sessionData.expiresAt <= now) {
    return false;
  }

  // Check session age (max 7 days regardless of activity)
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (now - sessionData.createdAt > maxAge) {
    return false;
  }

  return true;
}

/**
 * Update session data with new access time
 * @param {Object} sessionData - Session data to update
 * @returns {Object} Updated session data
 */
function updateSessionAccess(sessionData) {
  const now = Date.now();

  return {
    ...sessionData,
    lastAccessedAt: now,
    expiresAt: now + SESSION_TIMEOUT,
    analytics: {
      ...sessionData.analytics,
      requestCount: (sessionData.analytics.requestCount || 0) + 1,
      lastRequestAt: now
    }
  };
}

/**
 * Extract session token from request
 * @param {Object} req - Express request object
 * @returns {string|null} Session token
 */
function extractSessionToken(req) {
  // Try header first
  let token = req.get(SESSION_HEADER);
  if (token) {
    return token;
  }

  // Try cookie
  if (req.cookies && req.cookies[SESSION_COOKIE]) {
    return req.cookies[SESSION_COOKIE];
  }

  return null;
}

/**
 * Set session token in response
 * @param {Object} res - Express response object
 * @param {string} token - Session token
 * @param {Object} config - Configuration object
 */
function setSessionToken(res, token, config) {
  // Set header
  res.set(SESSION_HEADER, token);

  // Set cookie if not in testing environment
  if (!config.isTesting) {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: SESSION_TIMEOUT,
      path: '/'
    });
  }
}

/**
 * Clear session token from response
 * @param {Object} res - Express response object
 * @param {Object} config - Configuration object
 */
function clearSessionToken(res, config) {
  // Clear header
  res.removeHeader(SESSION_HEADER);

  // Clear cookie
  if (!config.isTesting) {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      path: '/'
    });
  }
}

/**
 * Session manager middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function sessionManager(req, res, next) {
  // Skip session management for health check routes
  if (req.path.startsWith('/health')) {
    return next();
  }

  const config = getConfig();
  const masterKey = config.security.encryptionKey;

  if (!masterKey) {
    logger.error('Missing encryption key for session management');
    return next(createError('unauthorized', 'Session management unavailable'));
  }

  try {
    const token = extractSessionToken(req);
    let sessionData = null;

    if (token) {
      try {
        sessionData = decryptSessionData(token, masterKey);

        if (isSessionValid(sessionData)) {
          // Update session access time
          sessionData = updateSessionAccess(sessionData);

          // Generate new token with updated data
          const newToken = encryptSessionData(sessionData, masterKey);
          setSessionToken(res, newToken, config);
        } else {
          // Invalid session, clear it
          sessionData = null;
          clearSessionToken(res, config);
        }
      } catch (error) {
        // Invalid token, clear it
        sessionData = null;
        clearSessionToken(res, config);
      }
    }

    // Create new session if none exists or invalid
    if (!sessionData) {
      sessionData = createSessionData(req);
      const newToken = encryptSessionData(sessionData, masterKey);
      setSessionToken(res, newToken, config);
    }

    // Attach session to request
    req.session = sessionData;
    req.sessionId = sessionData.id;

    // Add session helper methods
    req.updateSession = function(updates) {
      Object.assign(req.session, updates);
      const updatedToken = encryptSessionData(req.session, masterKey);
      setSessionToken(res, updatedToken, config);
    };

    req.destroySession = function() {
      req.session = null;
      req.sessionId = null;
      clearSessionToken(res, config);
    };

    next();
  } catch (error) {
    logger.error('Session manager error', { error: error.message });
    next(createError('unauthorized', 'Session management failed'));
  }
}

module.exports = {
  sessionManager,
  encryptSessionData,
  decryptSessionData,
  createSessionData,
  isSessionValid,
  updateSessionAccess,
  SESSION_HEADER,
  SESSION_COOKIE,
  SESSION_TIMEOUT
};
