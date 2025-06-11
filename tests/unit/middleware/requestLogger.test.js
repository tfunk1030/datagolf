/**
 * Unit Tests for Request Logger Middleware
 * Tests request logging, performance tracking, and middleware behavior
 * Following TDD methodology with comprehensive mocking
 */

const {
  requestLogger,
  requestTiming,
  securityHeaders,
  requestCorrelation,
  generateRequestId,
  getClientIp,
  getUserAgent,
  shouldLogRequest
} = require('../../../src/middleware/requestLogger');

// Mock dependencies
jest.mock('../../../src/config/environment');
jest.mock('../../../src/utils/logger', () => ({
  logRequest: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));
jest.mock('uuid', () => ({
  v4: jest.fn()
}));

const { getConfig } = require('../../../src/config/environment');
const { logRequest } = require('../../../src/utils/logger');
const { v4: uuidv4 } = require('uuid');

describe('RequestLogger Middleware', () => {
  let mockReq, mockRes, mockNext;
  let mockConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock request object
    mockReq = {
      path: '/api/test',
      method: 'GET',
      originalUrl: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn(),
      cookies: {},
      query: {},
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      headers: { 'content-length': '0' }
    };

    // Mock response object
    mockRes = {
      set: jest.fn(),
      get: jest.fn(),
      statusCode: 200,
      end: jest.fn()
    };

    // Mock next function
    mockNext = jest.fn();

    // Mock configuration
    mockConfig = {
      isProduction: false,
      analytics: {
        enabled: true
      }
    };

    getConfig.mockReturnValue(mockConfig);
  });

  describe('requestLogger middleware function', () => {
    it('should generate unique request ID and set response header', () => {
      // Given
      const mockId = 'test-request-id-123';
      uuidv4.mockReturnValue(mockId);
      mockReq.get.mockReturnValue('Mozilla/5.0');

      // When
      requestLogger(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.id).toBe(mockId);
      expect(mockReq.startTime).toBeDefined();
      expect(mockRes.set).toHaveBeenCalledWith('X-Request-ID', mockId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should skip logging for requests that should not be logged', () => {
      // Given
      mockReq.path = '/health';
      mockConfig.isProduction = true;
      getConfig.mockReturnValue(mockConfig);

      // When
      requestLogger(mockReq, mockRes, mockNext);

      // Then
      expect(mockNext).toHaveBeenCalledWith();
      expect(logRequest).not.toHaveBeenCalled();
    });

    it('should create request context with client information', () => {
      // Given
      const mockId = 'test-id';
      uuidv4.mockReturnValue(mockId);
      mockReq.get.mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      mockReq.ip = '192.168.1.100';

      // When
      requestLogger(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.context).toEqual({
        id: mockId,
        startTime: expect.any(Number),
        clientIp: '192.168.1.100',
        userAgent: {
          raw: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          isBot: false,
          isMobile: false,
          isDesktop: true
        },
        requestSize: {
          contentLength: 0,
          hasBody: false
        }
      });
    });

    it('should override res.end to capture response metrics and log request', (done) => {
      // Given
      const mockId = 'test-id';
      uuidv4.mockReturnValue(mockId);
      mockReq.get.mockReturnValue('Mozilla/5.0');
      mockReq.sessionId = 'session-123';
      mockRes.get.mockReturnValue('100');

      const originalEnd = mockRes.end;

      // When
      requestLogger(mockReq, mockRes, mockNext);

      // Simulate response end
      setTimeout(() => {
        mockRes.end('response data');

        // Then
        expect(logRequest).toHaveBeenCalledWith(mockReq, mockRes, expect.any(Number));
        expect(mockReq.analyticsData).toBeDefined();
        expect(mockReq.analyticsData.requestId).toBe(mockId);
        expect(mockReq.analyticsData.method).toBe('GET');
        expect(mockReq.analyticsData.statusCode).toBe(200);
        expect(mockReq.analyticsData.duration).toBeGreaterThan(0);
        expect(mockReq.analyticsData.performance).toBeDefined();
        done();
      }, 10);
    });

    it('should classify performance based on duration', (done) => {
      // Given
      uuidv4.mockReturnValue('test-id');
      mockReq.get.mockReturnValue('Mozilla/5.0');

      // Mock Date.now to control timing
      const originalNow = Date.now;
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        if (callCount === 1) return 1000; // Start time
        return 4000; // End time (3000ms duration = slow)
      });

      // When
      requestLogger(mockReq, mockRes, mockNext);

      setTimeout(() => {
        mockRes.end('response');

        // Then
        expect(mockReq.analyticsData.performance).toBe('slow');

        // Restore Date.now
        Date.now = originalNow;
        done();
      }, 10);
    });

    it('should include query parameters for GET requests', (done) => {
      // Given
      uuidv4.mockReturnValue('test-id');
      mockReq.get.mockReturnValue('Mozilla/5.0');
      mockReq.query = { page: '1', limit: '10' };

      // When
      requestLogger(mockReq, mockRes, mockNext);

      setTimeout(() => {
        mockRes.end('response');

        // Then
        expect(mockReq.analyticsData.queryParams).toEqual({ page: '1', limit: '10' });
        done();
      }, 10);
    });

    it('should not store analytics data when analytics is disabled', (done) => {
      // Given
      mockConfig.analytics.enabled = false;
      getConfig.mockReturnValue(mockConfig);
      uuidv4.mockReturnValue('test-id');
      mockReq.get.mockReturnValue('Mozilla/5.0');

      // When
      requestLogger(mockReq, mockRes, mockNext);

      setTimeout(() => {
        mockRes.end('response');

        // Then
        expect(mockReq.analyticsData).toBeUndefined();
        done();
      }, 10);
    });
  });

  describe('generateRequestId', () => {
    it('should generate a UUID', () => {
      // Given
      const mockUuid = 'test-uuid-123';
      uuidv4.mockReturnValue(mockUuid);

      // When
      const result = generateRequestId();

      // Then
      expect(result).toBe(mockUuid);
      expect(uuidv4).toHaveBeenCalledWith();
    });
  });

  describe('getClientIp', () => {
    it('should return req.ip when available', () => {
      // Given
      mockReq.ip = '192.168.1.1';

      // When
      const result = getClientIp(mockReq);

      // Then
      expect(result).toBe('192.168.1.1');
    });

    it('should fallback to connection.remoteAddress', () => {
      // Given
      mockReq.ip = null;
      mockReq.connection = { remoteAddress: '10.0.0.1' };

      // When
      const result = getClientIp(mockReq);

      // Then
      expect(result).toBe('10.0.0.1');
    });

    it('should fallback to socket.remoteAddress', () => {
      // Given
      mockReq.ip = null;
      mockReq.connection = {};
      mockReq.socket = { remoteAddress: '172.16.0.1' };

      // When
      const result = getClientIp(mockReq);

      // Then
      expect(result).toBe('172.16.0.1');
    });

    it('should return unknown when no IP is available', () => {
      // Given
      mockReq.ip = null;
      mockReq.connection = {};
      mockReq.socket = {};

      // When
      const result = getClientIp(mockReq);

      // Then
      expect(result).toBe('unknown');
    });
  });

  describe('getUserAgent', () => {
    it('should parse desktop user agent', () => {
      // Given
      mockReq.get.mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      // When
      const result = getUserAgent(mockReq);

      // Then
      expect(result).toEqual({
        raw: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        isBot: false,
        isMobile: false,
        isDesktop: true
      });
    });

    it('should parse mobile user agent', () => {
      // Given
      mockReq.get.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)');

      // When
      const result = getUserAgent(mockReq);

      // Then
      expect(result).toEqual({
        raw: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        isBot: false,
        isMobile: true,
        isDesktop: false
      });
    });

    it('should parse bot user agent', () => {
      // Given
      mockReq.get.mockReturnValue('Googlebot/2.1 (+http://www.google.com/bot.html)');

      // When
      const result = getUserAgent(mockReq);

      // Then
      expect(result).toEqual({
        raw: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
        isBot: true,
        isMobile: false,
        isDesktop: false
      });
    });

    it('should handle missing user agent', () => {
      // Given
      mockReq.get.mockReturnValue(null);

      // When
      const result = getUserAgent(mockReq);

      // Then
      expect(result).toEqual({
        raw: 'unknown',
        isBot: false,
        isMobile: false,
        isDesktop: true
      });
    });
  });

  describe('shouldLogRequest', () => {
    it('should skip health checks in production', () => {
      // Given
      mockConfig.isProduction = true;
      getConfig.mockReturnValue(mockConfig);
      mockReq.path = '/health';

      // When
      const result = shouldLogRequest(mockReq);

      // Then
      expect(result).toBe(false);
    });

    it('should skip static assets in production', () => {
      // Given
      mockConfig.isProduction = true;
      getConfig.mockReturnValue(mockConfig);
      mockReq.path = '/assets/style.css';

      // When
      const result = shouldLogRequest(mockReq);

      // Then
      expect(result).toBe(false);
    });

    it('should skip OPTIONS requests', () => {
      // Given
      mockReq.method = 'OPTIONS';

      // When
      const result = shouldLogRequest(mockReq);

      // Then
      expect(result).toBe(false);
    });

    it('should log regular API requests', () => {
      // Given
      mockReq.path = '/api/users';
      mockReq.method = 'GET';

      // When
      const result = shouldLogRequest(mockReq);

      // Then
      expect(result).toBe(true);
    });
  });

  describe('requestTiming middleware', () => {
    it('should initialize timing data', () => {
      // When
      requestTiming(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.timings).toBeDefined();
      expect(mockReq.timings.start).toBeDefined();
      expect(typeof mockReq.addTiming).toBe('function');
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should add timing helper function', () => {
      // Given
      requestTiming(mockReq, mockRes, mockNext);

      // When
      mockReq.addTiming('database');

      // Then
      expect(mockReq.timings.database).toBeDefined();
      expect(typeof mockReq.timings.database).toBe('number');
    });
  });

  describe('securityHeaders middleware', () => {
    it('should set security headers', () => {
      // When
      securityHeaders(mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.set).toHaveBeenCalledWith({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requestCorrelation middleware', () => {
    it('should use existing correlation ID from header', () => {
      // Given
      const existingId = 'existing-correlation-id';
      mockReq.get.mockReturnValue(existingId);

      // When
      requestCorrelation(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.correlationId).toBe(existingId);
      expect(mockRes.set).toHaveBeenCalledWith('X-Correlation-ID', existingId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should generate new correlation ID when none exists', () => {
      // Given
      const newId = 'new-correlation-id';
      mockReq.get.mockReturnValue(null);
      uuidv4.mockReturnValue(newId);

      // When
      requestCorrelation(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.correlationId).toBe(newId);
      expect(mockRes.set).toHaveBeenCalledWith('X-Correlation-ID', newId);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should use request ID as fallback', () => {
      // Given
      mockReq.get.mockReturnValue(null);
      mockReq.id = 'request-id-123';

      // When
      requestCorrelation(mockReq, mockRes, mockNext);

      // Then
      expect(mockReq.correlationId).toBe('request-id-123');
      expect(mockRes.set).toHaveBeenCalledWith('X-Correlation-ID', 'request-id-123');
    });
  });
});
