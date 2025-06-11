/**
 * Unit Tests for Error Handler Middleware
 * Tests error handling, response formatting, and logging behavior
 * Following TDD methodology with comprehensive mocking
 */

const {
  errorHandler,
  notFoundHandler,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  ExternalServiceError
} = require('../../../src/middleware/errorHandler');

// Mock dependencies
jest.mock('../../../src/config/environment');
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const { getConfig } = require('../../../src/config/environment');
const logger = require('../../../src/utils/logger');

describe('ErrorHandler Middleware', () => {
  let mockReq, mockRes, mockNext;
  let mockConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock request object
    mockReq = {
      method: 'GET',
      originalUrl: '/api/test',
      ip: '127.0.0.1',
      id: 'test-request-id',
      correlationId: 'test-correlation-id',
      headers: { 'user-agent': 'test-agent' }
    };

    // Mock response object
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      headersSent: false
    };

    // Mock next function
    mockNext = jest.fn();

    // Mock configuration
    mockConfig = {
      isProduction: false,
      isDevelopment: true
    };

    getConfig.mockReturnValue(mockConfig);
  });

  describe('errorHandler middleware function', () => {
    it('should handle ValidationError with 400 status', () => {
      // Given
      const error = new ValidationError('Invalid input data', { field: 'email' });

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'ValidationError',
          message: 'Invalid input data',
          details: { field: 'email' },
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle AuthenticationError with 401 status', () => {
      // Given
      const error = new AuthenticationError('Invalid credentials');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'AuthenticationError',
          message: 'Invalid credentials',
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle AuthorizationError with 403 status', () => {
      // Given
      const error = new AuthorizationError('Insufficient permissions');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'AuthorizationError',
          message: 'Insufficient permissions',
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle DatabaseError with 500 status', () => {
      // Given
      const error = new DatabaseError('Connection failed', { code: 'CONN_TIMEOUT' });

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'DatabaseError',
          message: 'Database operation failed',
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle ExternalServiceError with 502 status', () => {
      // Given
      const error = new ExternalServiceError('API unavailable', { service: 'payment' });

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(502);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'ExternalServiceError',
          message: 'External service unavailable',
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle generic Error with 500 status', () => {
      // Given
      const error = new Error('Something went wrong');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'InternalServerError',
          message: 'Internal server error',
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
      expect(logger.error).toHaveBeenCalled();
    });

    it('should include stack trace in development mode', () => {
      // Given
      mockConfig.isDevelopment = true;
      getConfig.mockReturnValue(mockConfig);
      const error = new Error('Test error');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'InternalServerError',
          message: 'Internal server error',
          requestId: 'test-request-id',
          timestamp: expect.any(String),
          stack: expect.any(String)
        }
      });
    });

    it('should not include stack trace in production mode', () => {
      // Given
      mockConfig.isProduction = true;
      mockConfig.isDevelopment = false;
      getConfig.mockReturnValue(mockConfig);
      const error = new Error('Test error');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      const responseCall = mockRes.json.mock.calls[0][0];
      expect(responseCall.error.stack).toBeUndefined();
    });

    it('should not send response if headers already sent', () => {
      // Given
      mockRes.headersSent = true;
      const error = new Error('Test error');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle error without request ID gracefully', () => {
      // Given
      delete mockReq.id;
      const error = new ValidationError('Test error');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'ValidationError',
          message: 'Test error',
          requestId: 'unknown',
          timestamp: expect.any(String)
        }
      });
    });

    it('should log error context with correlation ID', () => {
      // Given
      const error = new DatabaseError('Connection failed');

      // When
      errorHandler(error, mockReq, mockRes, mockNext);

      // Then
      expect(logger.error).toHaveBeenCalledWith(
        'Database error occurred',
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'DatabaseError',
            message: 'Connection failed'
          }),
          request: expect.objectContaining({
            id: 'test-request-id',
            correlationId: 'test-correlation-id',
            method: 'GET',
            url: '/api/test',
            ip: '127.0.0.1'
          })
        })
      );
    });
  });

  describe('notFoundHandler middleware', () => {
    it('should return 404 for unmatched routes', () => {
      // When
      notFoundHandler(mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'NotFoundError',
          message: 'Resource not found',
          path: '/api/test',
          method: 'GET',
          requestId: 'test-request-id',
          timestamp: expect.any(String)
        }
      });
    });

    it('should handle missing request ID in notFoundHandler', () => {
      // Given
      delete mockReq.id;

      // When
      notFoundHandler(mockReq, mockRes, mockNext);

      // Then
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          type: 'NotFoundError',
          message: 'Resource not found',
          path: '/api/test',
          method: 'GET',
          requestId: 'unknown',
          timestamp: expect.any(String)
        }
      });
    });

    it('should log 404 errors', () => {
      // When
      notFoundHandler(mockReq, mockRes, mockNext);

      // Then
      expect(logger.warn).toHaveBeenCalledWith(
        'Route not found',
        expect.objectContaining({
          method: 'GET',
          url: '/api/test',
          ip: '127.0.0.1',
          userAgent: 'test-agent'
        })
      );
    });
  });

  describe('Custom Error Classes', () => {
    describe('ValidationError', () => {
      it('should create ValidationError with message and details', () => {
        // Given
        const details = { field: 'email', value: 'invalid' };

        // When
        const error = new ValidationError('Invalid email format', details);

        // Then
        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Invalid email format');
        expect(error.details).toEqual(details);
        expect(error.statusCode).toBe(400);
        expect(error instanceof Error).toBe(true);
      });

      it('should create ValidationError without details', () => {
        // When
        const error = new ValidationError('Validation failed');

        // Then
        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe('Validation failed');
        expect(error.details).toBeUndefined();
        expect(error.statusCode).toBe(400);
      });
    });

    describe('AuthenticationError', () => {
      it('should create AuthenticationError with correct properties', () => {
        // When
        const error = new AuthenticationError('Token expired');

        // Then
        expect(error.name).toBe('AuthenticationError');
        expect(error.message).toBe('Token expired');
        expect(error.statusCode).toBe(401);
        expect(error instanceof Error).toBe(true);
      });
    });

    describe('AuthorizationError', () => {
      it('should create AuthorizationError with correct properties', () => {
        // When
        const error = new AuthorizationError('Access denied');

        // Then
        expect(error.name).toBe('AuthorizationError');
        expect(error.message).toBe('Access denied');
        expect(error.statusCode).toBe(403);
        expect(error instanceof Error).toBe(true);
      });
    });

    describe('DatabaseError', () => {
      it('should create DatabaseError with details', () => {
        // Given
        const details = { query: 'SELECT * FROM users', code: 'TIMEOUT' };

        // When
        const error = new DatabaseError('Query timeout', details);

        // Then
        expect(error.name).toBe('DatabaseError');
        expect(error.message).toBe('Query timeout');
        expect(error.details).toEqual(details);
        expect(error.statusCode).toBe(500);
        expect(error instanceof Error).toBe(true);
      });
    });

    describe('ExternalServiceError', () => {
      it('should create ExternalServiceError with service details', () => {
        // Given
        const details = { service: 'payment-api', endpoint: '/charge' };

        // When
        const error = new ExternalServiceError('Service unavailable', details);

        // Then
        expect(error.name).toBe('ExternalServiceError');
        expect(error.message).toBe('Service unavailable');
        expect(error.details).toEqual(details);
        expect(error.statusCode).toBe(502);
        expect(error instanceof Error).toBe(true);
      });
    });
  });

  describe('Error inheritance and instanceof checks', () => {
    it('should properly inherit from Error class', () => {
      // Given
      const validationError = new ValidationError('Test');
      const authError = new AuthenticationError('Test');
      const authzError = new AuthorizationError('Test');
      const dbError = new DatabaseError('Test');
      const serviceError = new ExternalServiceError('Test');

      // Then
      expect(validationError instanceof Error).toBe(true);
      expect(authError instanceof Error).toBe(true);
      expect(authzError instanceof Error).toBe(true);
      expect(dbError instanceof Error).toBe(true);
      expect(serviceError instanceof Error).toBe(true);

      expect(validationError instanceof ValidationError).toBe(true);
      expect(authError instanceof AuthenticationError).toBe(true);
      expect(authzError instanceof AuthorizationError).toBe(true);
      expect(dbError instanceof DatabaseError).toBe(true);
      expect(serviceError instanceof ExternalServiceError).toBe(true);
    });

    it('should have proper stack traces', () => {
      // When
      const error = new ValidationError('Test error');

      // Then
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('ValidationError: Test error');
    });
  });
});
