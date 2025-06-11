/**
 * Golf API Analytics Backend Service
 * Main application entry point with Express server setup
 * Implements clean architecture with modular middleware and routing
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { getConfig, validateConfig } = require('./config/environment');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const { sessionManager } = require('./middleware/sessionManager');

// Import route modules
const healthRoutes = require('./routes/health');
const dataGolfRoutes = require('./routes/dataGolf');

/**
 * Create and configure Express application
 * @returns {Object} Configured Express app
 */
function createApp() {
  const config = getConfig();
  validateConfig(config);

  const app = express();

  // Trust proxy for accurate client IPs behind reverse proxy
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: config.security.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID']
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.security.rateLimiting.windowMs,
    max: config.security.rateLimiting.max,
    message: {
      error: 'Too many requests from this IP',
      retryAfter: Math.ceil(config.security.rateLimiting.windowMs / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(limiter);

  // Compression middleware
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024
  }));

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Custom middleware
  app.use(requestLogger);
  app.use(sessionManager);

  // API routes
  app.use('/health', healthRoutes);
  app.use('/api/data-golf', dataGolfRoutes);

  // Serve static files in production
  if (config.isProduction) {
    const staticPath = path.join(__dirname, '../public');
    if (fs.existsSync(staticPath)) {
      app.use(express.static(staticPath));
    }
  }

  // 404 handler for undefined routes
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start the server
 * @param {Object} app - Express application
 * @returns {Object} HTTP server instance
 */
function startServer(app) {
  const config = getConfig();

  const server = app.listen(config.port, () => {
    logger.info(`Golf API Analytics Backend started`, {
      port: config.port,
      environment: config.env,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    });
  });

  // Graceful shutdown handling
  const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}, starting graceful shutdown`);

    server.close((err) => {
      if (err) {
        logger.error('Error during server shutdown', err);
        process.exit(1);
      }

      logger.info('Server closed successfully');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', err);
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
    gracefulShutdown('unhandledRejection');
  });

  return server;
}

// Start server if this file is run directly
if (require.main === module) {
  try {
    const app = createApp();
    startServer(app);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

module.exports = {
  createApp,
  startServer
};
