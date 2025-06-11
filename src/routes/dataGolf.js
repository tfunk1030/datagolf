/**
 * Data Golf API Routes
 * Provides RESTful endpoints for golf data with authentication and validation
 * Implements proper error handling and response formatting
 */

const express = require('express');
const DataGolfService = require('../services/dataGolfService');
const logger = require('../utils/logger');

const router = express.Router();
const dataGolfService = new DataGolfService();

/**
 * Input validation middleware
 * @param {Object} schema - Validation schema
 * @returns {Function} Middleware function
 */
function validateInput(schema) {
  return (req, res, next) => {
    const errors = [];

    // Validate required parameters
    if (schema.required) {
      for (const field of schema.required) {
        if (!req.params[field] && !req.query[field] && !req.body[field]) {
          errors.push(`Missing required parameter: ${field}`);
        }
      }
    }

    // Validate parameter types and formats
    if (schema.params) {
      for (const [param, rules] of Object.entries(schema.params)) {
        const value = req.params[param] || req.query[param] || req.body[param];

        if (value !== undefined) {
          if (rules.type === 'string' && typeof value !== 'string') {
            errors.push(`Parameter ${param} must be a string`);
          }

          if (rules.type === 'number' && isNaN(Number(value))) {
            errors.push(`Parameter ${param} must be a number`);
          }

          if (rules.pattern && !rules.pattern.test(value)) {
            errors.push(`Parameter ${param} has invalid format`);
          }

          if (rules.enum && !rules.enum.includes(value)) {
            errors.push(`Parameter ${param} must be one of: ${rules.enum.join(', ')}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
}

/**
 * Response formatting middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function formatResponse(req, res, next) {
  const originalJson = res.json;

  res.json = function(data) {
    const response = {
      success: res.statusCode < 400,
      data: data,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || req.sessionID,
        endpoint: req.originalUrl,
        method: req.method
      }
    };

    return originalJson.call(this, response);
  };

  next();
}

// Apply response formatting to all routes
router.use(formatResponse);

/**
 * GET /tournaments
 * Get tournament data with optional filtering
 */
router.get('/tournaments',
  validateInput({
    params: {
      season: { type: 'number' },
      tour: { type: 'string', enum: ['PGA', 'European', 'LPGA'] },
      status: { type: 'string', enum: ['scheduled', 'active', 'completed'] }
    }
  }),
  async (req, res) => {
    try {
      const options = {
        season: req.query.season,
        tour: req.query.tour,
        status: req.query.status,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined
      };

      // Remove undefined values
      Object.keys(options).forEach(key =>
        options[key] === undefined && delete options[key]
      );

      const useCache = req.query.cache !== 'false';
      const tournaments = await dataGolfService.getTournaments(options, useCache);

      logger.info('Tournaments retrieved', {
        options,
        count: tournaments.tournaments?.length || 0,
        cached: useCache
      });

      res.json(tournaments);
    } catch (error) {
      logger.error('Failed to get tournaments', { error: error.message, query: req.query });
      res.status(500).json({
        error: 'Failed to retrieve tournaments',
        message: error.message
      });
    }
  }
);

/**
 * GET /rankings
 * Get player rankings with optional filtering
 */
router.get('/rankings',
  validateInput({
    params: {
      season: { type: 'number' },
      tour: { type: 'string' },
      limit: { type: 'number' }
    }
  }),
  async (req, res) => {
    try {
      const options = {
        season: req.query.season,
        tour: req.query.tour,
        limit: req.query.limit ? parseInt(req.query.limit) : undefined
      };

      Object.keys(options).forEach(key =>
        options[key] === undefined && delete options[key]
      );

      const useCache = req.query.cache !== 'false';
      const rankings = await dataGolfService.getPlayerRankings(options, useCache);

      logger.info('Rankings retrieved', {
        options,
        count: rankings.rankings?.length || 0,
        cached: useCache
      });

      res.json(rankings);
    } catch (error) {
      logger.error('Failed to get rankings', { error: error.message, query: req.query });
      res.status(500).json({
        error: 'Failed to retrieve rankings',
        message: error.message
      });
    }
  }
);

/**
 * GET /tournaments/:tournamentId/field
 * Get tournament field data
 */
router.get('/tournaments/:tournamentId/field',
  validateInput({
    required: ['tournamentId'],
    params: {
      tournamentId: { type: 'string', pattern: /^[a-zA-Z0-9_-]+$/ }
    }
  }),
  async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const options = {
        round: req.query.round,
        status: req.query.status
      };

      Object.keys(options).forEach(key =>
        options[key] === undefined && delete options[key]
      );

      const useCache = req.query.cache !== 'false';
      const field = await dataGolfService.getTournamentField(tournamentId, options, useCache);

      logger.info('Tournament field retrieved', {
        tournamentId,
        options,
        count: field.field?.length || 0,
        cached: useCache
      });

      res.json(field);
    } catch (error) {
      logger.error('Failed to get tournament field', {
        error: error.message,
        tournamentId: req.params.tournamentId,
        query: req.query
      });

      if (error.message.includes('Tournament ID is required')) {
        res.status(400).json({
          error: 'Invalid tournament ID',
          message: error.message
        });
      } else {
        res.status(500).json({
          error: 'Failed to retrieve tournament field',
          message: error.message
        });
      }
    }
  }
);

/**
 * GET /tournaments/:tournamentId/scoring
 * Get live scoring data
 */
router.get('/tournaments/:tournamentId/scoring',
  validateInput({
    required: ['tournamentId'],
    params: {
      tournamentId: { type: 'string', pattern: /^[a-zA-Z0-9_-]+$/ },
      round: { type: 'number' }
    }
  }),
  async (req, res) => {
    try {
      const { tournamentId } = req.params;
      const options = {
        round: req.query.round ? parseInt(req.query.round) : undefined,
        live: req.query.live === 'true'
      };

      Object.keys(options).forEach(key =>
        options[key] === undefined && delete options[key]
      );

      const useCache = req.query.cache !== 'false';
      const scoring = await dataGolfService.getLiveScoring(tournamentId, options, useCache);

      logger.info('Live scoring retrieved', {
        tournamentId,
        options,
        count: scoring.scores?.length || 0,
        cached: useCache
      });

      res.json(scoring);
    } catch (error) {
      logger.error('Failed to get live scoring', {
        error: error.message,
        tournamentId: req.params.tournamentId,
        query: req.query
      });

      if (error.message.includes('Tournament ID is required')) {
        res.status(400).json({
          error: 'Invalid tournament ID',
          message: error.message
        });
      } else {
        res.status(500).json({
          error: 'Failed to retrieve live scoring',
          message: error.message
        });
      }
    }
  }
);

/**
 * GET /players/:playerId/stats
 * Get player statistics
 */
router.get('/players/:playerId/stats',
  validateInput({
    required: ['playerId'],
    params: {
      playerId: { type: 'string', pattern: /^[a-zA-Z0-9_-]+$/ },
      season: { type: 'number' }
    }
  }),
  async (req, res) => {
    try {
      const { playerId } = req.params;
      const options = {
        season: req.query.season ? parseInt(req.query.season) : undefined,
        tour: req.query.tour
      };

      Object.keys(options).forEach(key =>
        options[key] === undefined && delete options[key]
      );

      const useCache = req.query.cache !== 'false';
      const stats = await dataGolfService.getPlayerStats(playerId, options, useCache);

      logger.info('Player stats retrieved', {
        playerId,
        options,
        cached: useCache
      });

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get player stats', {
        error: error.message,
        playerId: req.params.playerId,
        query: req.query
      });

      if (error.message.includes('Player ID is required')) {
        res.status(400).json({
          error: 'Invalid player ID',
          message: error.message
        });
      } else {
        res.status(500).json({
          error: 'Failed to retrieve player statistics',
          message: error.message
        });
      }
    }
  }
);

/**
 * GET /betting-odds
 * Get betting odds data
 */
router.get('/betting-odds',
  validateInput({
    params: {
      tournamentId: { type: 'string' },
      bookmaker: { type: 'string' }
    }
  }),
  async (req, res) => {
    try {
      const options = {
        tournamentId: req.query.tournamentId,
        bookmaker: req.query.bookmaker,
        market: req.query.market
      };

      Object.keys(options).forEach(key =>
        options[key] === undefined && delete options[key]
      );

      const useCache = req.query.cache !== 'false';
      const odds = await dataGolfService.getBettingOdds(options, useCache);

      logger.info('Betting odds retrieved', {
        options,
        count: odds.odds?.length || 0,
        cached: useCache
      });

      res.json(odds);
    } catch (error) {
      logger.error('Failed to get betting odds', { error: error.message, query: req.query });
      res.status(500).json({
        error: 'Failed to retrieve betting odds',
        message: error.message
      });
    }
  }
);

/**
 * DELETE /cache/:dataType
 * Invalidate cache for specific data type
 */
router.delete('/cache/:dataType',
  validateInput({
    required: ['dataType'],
    params: {
      dataType: {
        type: 'string',
        enum: ['tournaments', 'rankings', 'field', 'scoring', 'playerStats', 'bettingOdds', 'all']
      }
    }
  }),
  async (req, res) => {
    try {
      const { dataType } = req.params;
      const filters = {
        tournamentId: req.query.tournamentId,
        playerId: req.query.playerId
      };

      Object.keys(filters).forEach(key =>
        filters[key] === undefined && delete filters[key]
      );

      const invalidated = await dataGolfService.invalidateCache(dataType, filters);

      logger.info('Cache invalidated', { dataType, filters, invalidated });

      res.json({
        message: 'Cache invalidated successfully',
        dataType,
        filters,
        invalidatedEntries: invalidated
      });
    } catch (error) {
      logger.error('Failed to invalidate cache', {
        error: error.message,
        dataType: req.params.dataType,
        query: req.query
      });
      res.status(500).json({
        error: 'Failed to invalidate cache',
        message: error.message
      });
    }
  }
);

/**
 * GET /health
 * Get service health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await dataGolfService.getHealthStatus();

    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 206 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /metrics
 * Get service performance metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = dataGolfService.getMetrics();

    logger.debug('Metrics retrieved', metrics);

    res.json({
      message: 'Service metrics',
      metrics
    });
  } catch (error) {
    logger.error('Failed to get metrics', { error: error.message });
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      message: error.message
    });
  }
});

module.exports = router;
