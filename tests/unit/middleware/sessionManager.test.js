/**
 * Unit Tests for Session Manager Middleware
 * Tests session creation, validation, encryption/decryption, and middleware behavior
 * Following TDD methodology with comprehensive mocking
 */

const crypto = require('crypto');
const {
  sessionManager,
  encryptSessionData,
  decryptSessionData,
  createSessionData,
  isSessionValid,
  updateSessionAccess,
  SESSION_HEADER,
  SESSION_COOKIE,
  SESSION_TIMEOUT
} = require('../../../src/middleware/sessionManager');

// Mock dependencies
jest.mock('../../../src/config/environment');
jest.mock('../../../src/middleware/errorHandler');
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));
jest.mock('crypto');

const { getConfig } = require('../../../src/config/environment');
const { createError } = require('../../../src/middleware/errorHandler');
const logger = require('../../../src/utils/logger');

describe('SessionManager Middleware', () => {
  let mockReq, mockRes, mockNext;
  let mockConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock request object
    mockReq = {
      path: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn(),
      cookies: {},
      method: 'GET',
      originalUrl: '/api/test'
    };

    // Mock response object
    mockRes = {
      set: jest.fn(),
      cookie: jest.fn(),
      removeHeader: jest.fn(),
      clearCookie: jest.fn()
    };

    // Mock next function
    mockNext = jest.fn();

    // Mock configuration
    mockConfig = {
      security: {
        encryptionKey: 'test-encryption-key-32-characters'
      },
      isProduction: false,
      isTesting: true
    };

    getConfig.mockReturnValue(mockConfig);

    // Mock crypto functions
    crypto.randomBytes = jest.fn();
    crypto.pbkdf2Sync = jest.fn();
    crypto.createCipher = jest.fn();
    crypto.createDecipher = jest.fn();
    crypto.randomUUID = jest.fn();
  });

  describe('sessionManager middleware function', () => {
    it('should skip session management for health check routes', () => {
      // Given
      mockReq.path = '/health';

      // When
      sessionManager(mockReq, mockRes, mockNext);

      // Then
      expect(mockNext).toHaveBeenCalledWith();
      expect(getConfig).not.toHaveBeenCalled();
    });

    it('should return error when encryption key is missing', () => {
      // Given
      mockConfig.security.encryptionKey = null;
      getConfig.mockReturnValue(mockConfig);
      const mockError = new Error('Session management unavailable');
      createError.mockReturnValue(mockError);

      // When
      sessionManager(mockReq, mockRes, mockNext);

      // Then
      expect(logger.error).toHaveBeenCalledWith('Missing encryption key for session management');
      expect(createError).toHaveBeenCalledWith('unauthorized', 'Session management unavailable');
      expect(mockNext).toHaveBeenCalledWith(mockError);
    });

    it('should create new session when no token exists', () => {
      // Given
      mockReq.get.mockReturnValue(null);
      crypto.randomUUID.mockReturnValue('test-session-id');
      const mockEncryptedToken = 'encrypted-token';

      // Mock encryption
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };
      crypto.createCipher.mockReturnValue(mockCipher);
      crypto.randomBytes.mockReturnValue(Buffer.from('random'));
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));

      // When
      sessionManager(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.session).toBeDefined();
      expect(mockReq.sessionId).toBe('test-session-id');
      expect(mockRes.set).toHaveBeenCalledWith(SESSION_HEADER, expect.any(String));
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should validate and update existing session when valid token provided', () => {
      // Given
      const validToken = 'valid-encrypted-token';
      mockReq.get.mockReturnValue(validToken);

      const mockSessionData = {
        id: 'existing-session-id',
        createdAt: Date.now() - 1000,
        lastAccessedAt: Date.now() - 1000,
        expiresAt: Date.now() + SESSION_TIMEOUT,
        userAgent: 'test-agent',
        clientIp: '127.0.0.1',
        preferences: {},
        analytics: {
          requestCount: 1,
          lastRequestAt: Date.now() - 1000
        }
      };

      // Mock decryption
      const mockDecipher = {
        setAAD: jest.fn(),
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('data')
      };
      crypto.createDecipher.mockReturnValue(mockDecipher);
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));

      // Mock JSON.parse to return session data
      const originalParse = JSON.parse;
      JSON.parse = jest.fn().mockReturnValue(mockSessionData);

      // Mock encryption for new token
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };
      crypto.createCipher.mockReturnValue(mockCipher);
      crypto.randomBytes.mockReturnValue(Buffer.from('random'));

      // When
      sessionManager(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.session).toBeDefined();
      expect(mockReq.sessionId).toBe('existing-session-id');
      expect(mockReq.session.analytics.requestCount).toBe(2);
      expect(mockRes.set).toHaveBeenCalledWith(SESSION_HEADER, expect.any(String));
      expect(mockNext).toHaveBeenCalledWith();

      // Restore JSON.parse
      JSON.parse = originalParse;
    });

    it('should clear invalid session and create new one', () => {
      // Given
      const invalidToken = 'invalid-encrypted-token';
      mockReq.get.mockReturnValue(invalidToken);

      // Mock decryption to throw error
      crypto.createDecipher.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      crypto.randomUUID.mockReturnValue('new-session-id');

      // Mock encryption for new session
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };
      crypto.createCipher.mockReturnValue(mockCipher);
      crypto.randomBytes.mockReturnValue(Buffer.from('random'));
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));

      // When
      sessionManager(mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.removeHeader).toHaveBeenCalledWith(SESSION_HEADER);
      expect(mockReq.session).toBeDefined();
      expect(mockReq.sessionId).toBe('new-session-id');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should add session helper methods to request', () => {
      // Given
      mockReq.get.mockReturnValue(null);
      crypto.randomUUID.mockReturnValue('test-session-id');

      // Mock encryption
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };
      crypto.createCipher.mockReturnValue(mockCipher);
      crypto.randomBytes.mockReturnValue(Buffer.from('random'));
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));

      // When
      sessionManager(mockReq, mockRes, mockNext);

      // Then
      expect(typeof mockReq.updateSession).toBe('function');
      expect(typeof mockReq.destroySession).toBe('function');
    });

    it('should handle updateSession helper method', () => {
      // Given
      mockReq.get.mockReturnValue(null);
      crypto.randomUUID.mockReturnValue('test-session-id');

      // Mock encryption
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };
      crypto.createCipher.mockReturnValue(mockCipher);
      crypto.randomBytes.mockReturnValue(Buffer.from('random'));
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));

      sessionManager(mockReq, mockRes, mockNext);

      // When
      mockReq.updateSession({ preferences: { theme: 'dark' } });

      // Then
      expect(mockReq.session.preferences.theme).toBe('dark');
      expect(mockRes.set).toHaveBeenCalledWith(SESSION_HEADER, expect.any(String));
    });

    it('should handle destroySession helper method', () => {
      // Given
      mockReq.get.mockReturnValue(null);
      crypto.randomUUID.mockReturnValue('test-session-id');

      // Mock encryption
      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };
      crypto.createCipher.mockReturnValue(mockCipher);
      crypto.randomBytes.mockReturnValue(Buffer.from('random'));
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));

      sessionManager(mockReq, mockRes, mockNext);

      // When
      mockReq.destroySession();

      // Then
      expect(mockReq.session).toBeNull();
      expect(mockReq.sessionId).toBeNull();
      expect(mockRes.removeHeader).toHaveBeenCalledWith(SESSION_HEADER);
    });
  });

  describe('createSessionData', () => {
    it('should create session data with required fields', () => {
      // Given
      const mockUuid = 'test-uuid-123';
      crypto.randomUUID.mockReturnValue(mockUuid);
      mockReq.get.mockReturnValue('Mozilla/5.0');
      mockReq.ip = '192.168.1.1';

      // When
      const sessionData = createSessionData(mockReq);

      // Then
      expect(sessionData).toEqual({
        id: mockUuid,
        createdAt: expect.any(Number),
        lastAccessedAt: expect.any(Number),
        expiresAt: expect.any(Number),
        userAgent: 'Mozilla/5.0',
        clientIp: '192.168.1.1',
        preferences: {},
        analytics: {
          requestCount: 0,
          lastRequestAt: expect.any(Number)
        }
      });
    });

    it('should handle missing user agent and IP', () => {
      // Given
      crypto.randomUUID.mockReturnValue('test-uuid');
      mockReq.get.mockReturnValue(null);
      mockReq.ip = null;

      // When
      const sessionData = createSessionData(mockReq);

      // Then
      expect(sessionData.userAgent).toBe('unknown');
      expect(sessionData.clientIp).toBe('unknown');
    });
  });

  describe('isSessionValid', () => {
    it('should return false for null or undefined session', () => {
      expect(isSessionValid(null)).toBe(false);
      expect(isSessionValid(undefined)).toBe(false);
    });

    it('should return false for non-object session', () => {
      expect(isSessionValid('string')).toBe(false);
      expect(isSessionValid(123)).toBe(false);
    });

    it('should return false for session missing required fields', () => {
      const invalidSession = {
        id: 'test-id'
        // missing createdAt and expiresAt
      };
      expect(isSessionValid(invalidSession)).toBe(false);
    });

    it('should return false for expired session', () => {
      const expiredSession = {
        id: 'test-id',
        createdAt: Date.now() - 1000,
        expiresAt: Date.now() - 1000 // expired
      };
      expect(isSessionValid(expiredSession)).toBe(false);
    });

    it('should return false for session older than max age', () => {
      const oldSession = {
        id: 'test-id',
        createdAt: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days old
        expiresAt: Date.now() + SESSION_TIMEOUT
      };
      expect(isSessionValid(oldSession)).toBe(false);
    });

    it('should return true for valid session', () => {
      const validSession = {
        id: 'test-id',
        createdAt: Date.now() - 1000,
        expiresAt: Date.now() + SESSION_TIMEOUT
      };
      expect(isSessionValid(validSession)).toBe(true);
    });
  });

  describe('updateSessionAccess', () => {
    it('should update session access time and increment request count', () => {
      // Given
      const originalSession = {
        id: 'test-id',
        createdAt: Date.now() - 10000,
        lastAccessedAt: Date.now() - 5000,
        expiresAt: Date.now() + SESSION_TIMEOUT,
        analytics: {
          requestCount: 5,
          lastRequestAt: Date.now() - 5000
        }
      };

      // When
      const updatedSession = updateSessionAccess(originalSession);

      // Then
      expect(updatedSession.lastAccessedAt).toBeGreaterThan(originalSession.lastAccessedAt);
      expect(updatedSession.expiresAt).toBeGreaterThan(originalSession.expiresAt);
      expect(updatedSession.analytics.requestCount).toBe(6);
      expect(updatedSession.analytics.lastRequestAt).toBeGreaterThan(originalSession.analytics.lastRequestAt);
    });

    it('should handle session with missing analytics', () => {
      // Given
      const sessionWithoutAnalytics = {
        id: 'test-id',
        createdAt: Date.now() - 10000,
        lastAccessedAt: Date.now() - 5000,
        expiresAt: Date.now() + SESSION_TIMEOUT,
        analytics: {}
      };

      // When
      const updatedSession = updateSessionAccess(sessionWithoutAnalytics);

      // Then
      expect(updatedSession.analytics.requestCount).toBe(1);
      expect(updatedSession.analytics.lastRequestAt).toBeDefined();
    });
  });

  describe('encryptSessionData', () => {
    it('should encrypt session data successfully', () => {
      // Given
      const sessionData = { id: 'test', data: 'value' };
      const masterKey = 'test-key';

      const mockCipher = {
        setAAD: jest.fn(),
        update: jest.fn().mockReturnValue('encrypted'),
        final: jest.fn().mockReturnValue('data'),
        getAuthTag: jest.fn().mockReturnValue(Buffer.from('tag'))
      };

      crypto.randomBytes.mockReturnValue(Buffer.from('random'));
      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));
      crypto.createCipher.mockReturnValue(mockCipher);

      // When
      const result = encryptSessionData(sessionData, masterKey);

      // Then
      expect(typeof result).toBe('string');
      expect(crypto.createCipher).toHaveBeenCalledWith('aes-256-gcm', Buffer.from('derived-key'));
      expect(mockCipher.setAAD).toHaveBeenCalled();
      expect(mockCipher.update).toHaveBeenCalled();
      expect(mockCipher.final).toHaveBeenCalled();
    });

    it('should throw error when encryption fails', () => {
      // Given
      const sessionData = { id: 'test' };
      const masterKey = 'test-key';

      crypto.createCipher.mockImplementation(() => {
        throw new Error('Encryption failed');
      });

      const mockError = new Error('Session encryption failed');
      createError.mockReturnValue(mockError);

      // When & Then
      expect(() => encryptSessionData(sessionData, masterKey)).toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith('Session encryption failed', { error: 'Encryption failed' });
    });
  });

  describe('decryptSessionData', () => {
    it('should decrypt session data successfully', () => {
      // Given
      const token = Buffer.concat([
        Buffer.from('salt'.padEnd(32, '0')),
        Buffer.from('iv'.padEnd(16, '0')),
        Buffer.from('tag'.padEnd(16, '0')),
        Buffer.from('encrypted')
      ]).toString('base64');

      const masterKey = 'test-key';
      const expectedData = { id: 'test', data: 'value' };

      const mockDecipher = {
        setAAD: jest.fn(),
        setAuthTag: jest.fn(),
        update: jest.fn().mockReturnValue('decrypted'),
        final: jest.fn().mockReturnValue('data')
      };

      crypto.pbkdf2Sync.mockReturnValue(Buffer.from('derived-key'));
      crypto.createDecipher.mockReturnValue(mockDecipher);

      // Mock JSON.parse
      const originalParse = JSON.parse;
      JSON.parse = jest.fn().mockReturnValue(expectedData);

      // When
      const result = decryptSessionData(token, masterKey);

      // Then
      expect(result).toEqual(expectedData);
      expect(crypto.createDecipher).toHaveBeenCalledWith('aes-256-gcm', Buffer.from('derived-key'));
      expect(mockDecipher.setAAD).toHaveBeenCalled();
      expect(mockDecipher.setAuthTag).toHaveBeenCalled();

      // Restore JSON.parse
      JSON.parse = originalParse;
    });

    it('should throw error when decryption fails', () => {
      // Given
      const invalidToken = 'invalid-token';
      const masterKey = 'test-key';

      const mockError = new Error('Invalid session token');
      createError.mockReturnValue(mockError);

      // When & Then
      expect(() => decryptSessionData(invalidToken, masterKey)).toThrow(mockError);
      expect(logger.error).toHaveBeenCalledWith('Session decryption failed', expect.any(Object));
    });
  });
});
