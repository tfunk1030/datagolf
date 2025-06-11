/**
 * Environment Configuration Manager
 * Handles environment-specific settings with secure defaults
 * Supports development, testing, staging, and production environments
 */

const path = require('path');
require('dotenv').config();

const environments = {
  development: {
    port: process.env.PORT || 3001,
    nodeEnv: 'development',
    database: {
      type: 'sqlite',
      filename: process.env.DB_PATH || path.join(__dirname, '../../data/golf_analytics_dev.db'),
      options: {
        verbose: console.log
      }
    },
    cache: {
      l1: {
        enabled: true,
        maxSize: 1000,
        ttl: 300 // 5 minutes
      },
      l2: {
        enabled: true,
        maxSize: 5000,
        ttl: 1800 // 30 minutes
      },
      l3: {
        enabled: false // Disabled in development
      }
    },
    security: {
      encryptionKey: process.env.ENCRYPTION_KEY || 'dev-key-change-in-production',
      sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret',
      corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['http://localhost:3000'],
      rateLimiting: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000 // requests per window
      }
    },
    logging: {
      level: process.env.LOG_LEVEL || 'debug',
      file: process.env.LOG_FILE || path.join(__dirname, '../../logs/app.log')
    },
    analytics: {
      batchSize: 10,
      flushInterval: 5000 // 5 seconds for development
    },
    dataGolf: {
      apiKey: process.env.DATA_GOLF_API_KEY || '6e553031e00f887df049ed9bd76d',
      baseUrl: process.env.DATA_GOLF_BASE_URL || 'https://feeds.datagolf.com',
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000 // 1 second
    }
  },

  testing: {
    port: process.env.PORT || 3002,
    nodeEnv: 'testing',
    database: {
      type: 'sqlite',
      filename: ':memory:', // In-memory database for tests
      options: {}
    },
    cache: {
      l1: { enabled: true, maxSize: 100, ttl: 60 },
      l2: { enabled: true, maxSize: 500, ttl: 300 },
      l3: { enabled: false }
    },
    security: {
      encryptionKey: 'test-encryption-key-32-chars-long',
      sessionSecret: 'test-session-secret',
      corsOrigins: ['http://localhost:3000'],
      rateLimiting: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 100
      }
    },
    logging: {
      level: 'error',
      file: null // No file logging in tests
    },
    analytics: {
      batchSize: 5,
      flushInterval: 1000
    },
    dataGolf: {
      apiKey: process.env.DATA_GOLF_API_KEY || '6e553031e00f887df049ed9bd76d',
      baseUrl: process.env.DATA_GOLF_BASE_URL || 'https://feeds.datagolf.com',
      timeout: 10000, // 10 seconds for testing
      retryAttempts: 1,
      retryDelay: 500
    }
  },

  test: {
    port: process.env.PORT || 3002,
    nodeEnv: 'test',
    database: {
      type: 'sqlite',
      filename: ':memory:', // In-memory database for tests
      options: {}
    },
    cache: {
      l1: { enabled: true, maxSize: 100, ttl: 60 },
      l2: { enabled: true, maxSize: 500, ttl: 300 },
      l3: { enabled: false }
    },
    security: {
      encryptionKey: 'test-encryption-key-32-chars-long',
      sessionSecret: 'test-session-secret',
      corsOrigins: ['http://localhost:3000'],
      rateLimiting: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: 100
      }
    },
    logging: {
      level: 'error',
      file: null // No file logging in tests
    },
    analytics: {
      batchSize: 5,
      flushInterval: 1000
    },
    dataGolf: {
      apiKey: process.env.DATA_GOLF_API_KEY || '6e553031e00f887df049ed9bd76d',
      baseUrl: process.env.DATA_GOLF_BASE_URL || 'https://feeds.datagolf.com',
      timeout: 10000, // 10 seconds for testing
      retryAttempts: 1,
      retryDelay: 500
    }
  },

  staging: {
    port: process.env.PORT || 3001,
    nodeEnv: 'staging',
    database: {
      type: 'sqlite',
      filename: process.env.DB_PATH || path.join(__dirname, '../../data/golf_analytics_staging.db'),
      options: {}
    },
    cache: {
      l1: { enabled: true, maxSize: 2000, ttl: 600 },
      l2: { enabled: true, maxSize: 10000, ttl: 3600 },
      l3: { enabled: true, maxSize: 50000, ttl: 86400 }
    },
    security: {
      encryptionKey: process.env.ENCRYPTION_KEY,
      sessionSecret: process.env.SESSION_SECRET,
      corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [],
      rateLimiting: {
        windowMs: 15 * 60 * 1000,
        max: 500
      }
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE || path.join(__dirname, '../../logs/app.log')
    },
    analytics: {
      batchSize: 50,
      flushInterval: 30000
    },
    dataGolf: {
      apiKey: process.env.DATA_GOLF_API_KEY || '6e553031e00f887df049ed9bd76d',
      baseUrl: process.env.DATA_GOLF_BASE_URL || 'https://feeds.datagolf.com',
      timeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 2000 // 2 seconds
    }
  },

  production: {
    port: process.env.PORT || 3001,
    nodeEnv: 'production',
    database: {
      type: 'sqlite',
      filename: process.env.DB_PATH || path.join(__dirname, '../../data/golf_analytics_prod.db'),
      options: {}
    },
    cache: {
      l1: { enabled: true, maxSize: 5000, ttl: 900 },
      l2: { enabled: true, maxSize: 25000, ttl: 7200 },
      l3: { enabled: true, maxSize: 100000, ttl: 86400 }
    },
    security: {
      encryptionKey: process.env.ENCRYPTION_KEY,
      sessionSecret: process.env.SESSION_SECRET,
      corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [],
      rateLimiting: {
        windowMs: 15 * 60 * 1000,
        max: 200
      }
    },
    logging: {
      level: process.env.LOG_LEVEL || 'warn',
      file: process.env.LOG_FILE || path.join(__dirname, '../../logs/app.log')
    },
    analytics: {
      batchSize: 100,
      flushInterval: 60000
    },
    dataGolf: {
      apiKey: process.env.DATA_GOLF_API_KEY || '6e553031e00f887df049ed9bd76d',
      baseUrl: process.env.DATA_GOLF_BASE_URL || 'https://feeds.datagolf.com',
      timeout: 45000, // 45 seconds for production
      retryAttempts: 5,
      retryDelay: 3000 // 3 seconds
    }
  }
};

/**
 * Get current environment configuration
 * @returns {Object} Environment-specific configuration
 */
function getConfig() {
  const env = process.env.NODE_ENV || 'development';
  const config = environments[env];

  if (!config) {
    throw new Error(`Unknown environment: ${env}`);
  }

  // Validate required production secrets
  if (env === 'production' || env === 'staging') {
    if (!config.security.encryptionKey || !config.security.sessionSecret) {
      throw new Error('Missing required security configuration for production environment');
    }
  }

  return {
    ...config,
    env,
    isDevelopment: env === 'development',
    isTesting: env === 'testing' || env === 'test',
    isStaging: env === 'staging',
    isProduction: env === 'production'
  };
}

/**
 * Validate environment configuration
 * @param {Object} config - Configuration to validate
 * @returns {boolean} True if valid
 */
function validateConfig(config) {
  const required = ['port', 'nodeEnv', 'database', 'cache', 'security'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Missing required configuration field: ${field}`);
    }
  }

  // Validate database configuration
  if (!config.database.filename && config.database.type === 'sqlite') {
    throw new Error('SQLite database requires filename');
  }

  // Validate security configuration
  if (!config.security.encryptionKey || !config.security.sessionSecret) {
    if (config.isProduction || config.isStaging) {
      throw new Error('Production environments require encryption key and session secret');
    }
  }

  return true;
}

module.exports = {
  getConfig,
  validateConfig,
  environments
};
