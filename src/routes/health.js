/**
 * Health Check Routes
 * Provides system health monitoring and status endpoints
 * Used for load balancer health checks and system monitoring
 */

const express = require('express');
const { getConfig } = require('../config/environment');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Basic health check endpoint
 * Returns simple OK status for load balancers
 */
router.get('/', asyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}));

/**
 * Detailed health check endpoint
 * Returns comprehensive system status information
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const config = getConfig();
  const startTime = process.hrtime.bigint();

  // Basic system information
  const healthData = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.env,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    }
  };

  // Add performance metrics
  const endTime = process.hrtime.bigint();
  const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

  healthData.performance = {
    responseTime: `${responseTime.toFixed(2)}ms`,
    loadAverage: process.platform !== 'win32' ? require('os').loadavg() : null,
    cpuUsage: process.cpuUsage()
  };

  // Add session information if available
  if (req.session) {
    healthData.session = {
      id: req.sessionId,
      valid: true,
      requestCount: req.session.analytics?.requestCount || 0
    };
  }

  res.status(200).json(healthData);
}));

/**
 * Readiness probe endpoint
 * Checks if the service is ready to accept traffic
 */
router.get('/ready', asyncHandler(async (req, res) => {
  const config = getConfig();

  // Check if essential services are available
  const checks = {
    config: !!config,
    environment: !!config.env,
    encryption: !!config.security?.encryptionKey
  };

  const allChecksPass = Object.values(checks).every(check => check === true);

  if (allChecksPass) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      checks
    });
  }
}));

/**
 * Liveness probe endpoint
 * Checks if the service is alive and responsive
 */
router.get('/live', asyncHandler(async (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime()
  });
}));

/**
 * Metrics endpoint for monitoring systems
 * Returns basic metrics in a structured format
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const metrics = {
    timestamp: new Date().toISOString(),
    process: {
      uptime_seconds: process.uptime(),
      memory_usage_bytes: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      cpu_usage_microseconds: {
        user: cpuUsage.user,
        system: cpuUsage.system
      }
    },
    system: {
      node_version: process.version,
      platform: process.platform,
      arch: process.arch
    }
  };

  // Add load average for Unix systems
  if (process.platform !== 'win32') {
    const os = require('os');
    metrics.system.load_average = os.loadavg();
    metrics.system.free_memory_bytes = os.freemem();
    metrics.system.total_memory_bytes = os.totalmem();
  }

  res.status(200).json(metrics);
}));

/**
 * Version endpoint
 * Returns application version information
 */
router.get('/version', asyncHandler(async (req, res) => {
  const config = getConfig();

  res.status(200).json({
    name: 'Golf API Analytics Backend',
    version: process.env.npm_package_version || '1.0.0',
    environment: config.env,
    nodeVersion: process.version,
    buildDate: process.env.BUILD_DATE || null,
    gitCommit: process.env.GIT_COMMIT || null,
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
