/**
 * Data Golf Integration Service
 * Combines API client with caching, rate limiting, and data transformation
 * Implements circuit breaker pattern and comprehensive error handling
 */

const DataGolfClient = require('./dataGolfClient');
const CacheService = require('./cacheService');
const { getConfig } = require('../config/environment');
const logger = require('../utils/logger');

class DataGolfService {
  constructor() {
    this.config = getConfig();
    this.client = new DataGolfClient();
    this.cache = new CacheService();

    // Circuit breaker state
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      lastFailureTime: null,
      successCount: 0,
      threshold: 5, // failures before opening
      timeout: 60000, // 1 minute before trying again
      resetThreshold: 3 // successes to close circuit
    };

    // Rate limiting state
    this.rateLimiter = {
      requests: [],
      maxRequests: 100, // per minute
      windowMs: 60000
    };

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      averageResponseTime: 0,
      lastRequestTime: null
    };
  }

  /**
   * Get tournaments with caching and error handling
   * @param {Object} options - Query options
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Tournament data
   */
  async getTournaments(options = {}, useCache = true) {
    const cacheKey = this.cache.generateKey('tournament', options);
    return this._executeWithCaching(
      () => this.client.getTournaments(options),
      cacheKey,
      useCache,
      this.config.cache.l1.ttl
    );
  }

  /**
   * Get player rankings with caching and error handling
   * @param {Object} options - Query options
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Rankings data
   */
  async getPlayerRankings(options = {}, useCache = true) {
    const cacheKey = this.cache.generateKey('rankings', options);
    return this._executeWithCaching(
      () => this.client.getPlayerRankings(options),
      cacheKey,
      useCache,
      this.config.cache.l1.ttl
    );
  }

  /**
   * Get tournament field with caching and error handling
   * @param {string} tournamentId - Tournament identifier
   * @param {Object} options - Query options
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Field data
   */
  async getTournamentField(tournamentId, options = {}, useCache = true) {
    if (!tournamentId) {
      throw new Error('Tournament ID is required');
    }

    const cacheKey = this.cache.generateKey('field', { tournamentId, ...options });
    return this._executeWithCaching(
      () => this.client.getTournamentField(tournamentId, options),
      cacheKey,
      useCache,
      this.config.cache.l2.ttl
    );
  }

  /**
   * Get live scoring with shorter cache TTL
   * @param {string} tournamentId - Tournament identifier
   * @param {Object} options - Query options
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Scoring data
   */
  async getLiveScoring(tournamentId, options = {}, useCache = true) {
    if (!tournamentId) {
      throw new Error('Tournament ID is required');
    }

    const cacheKey = this.cache.generateKey('scoring', { tournamentId, ...options });
    // Use shorter TTL for live data
    const ttl = 30; // 30 seconds for live scoring
    return this._executeWithCaching(
      () => this.client.getLiveScoring(tournamentId, options),
      cacheKey,
      useCache,
      ttl
    );
  }

  /**
   * Get player statistics with caching
   * @param {string} playerId - Player identifier
   * @param {Object} options - Query options
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Player stats
   */
  async getPlayerStats(playerId, options = {}, useCache = true) {
    if (!playerId) {
      throw new Error('Player ID is required');
    }

    const cacheKey = this.cache.generateKey('playerStats', { playerId, ...options });
    return this._executeWithCaching(
      () => this.client.getPlayerStats(playerId, options),
      cacheKey,
      useCache,
      this.config.cache.l3.ttl
    );
  }

  /**
   * Get betting odds with caching
   * @param {Object} options - Query options
   * @param {boolean} useCache - Whether to use cache
   * @returns {Promise<Object>} Betting odds
   */
  async getBettingOdds(options = {}, useCache = true) {
    const cacheKey = this.cache.generateKey('bettingOdds', options);
    // Use shorter TTL for betting odds as they change frequently
    const ttl = 300; // 5 minutes
    return this._executeWithCaching(
      () => this.client.getBettingOdds(options),
      cacheKey,
      useCache,
      ttl
    );
  }

  /**
   * Invalidate cache for specific data types
   * @param {string} dataType - Type of data to invalidate
   * @param {Object} filters - Additional filters for cache invalidation
   * @returns {Promise<number>} Number of invalidated entries
   */
  async invalidateCache(dataType, filters = {}) {
    try {
      let pattern;

      switch (dataType) {
        case 'tournaments':
          pattern = '^tournament:';
          break;
        case 'rankings':
          pattern = '^rankings:';
          break;
        case 'field':
          pattern = filters.tournamentId ? `^field:.*tournamentId:${filters.tournamentId}` : '^field:';
          break;
        case 'scoring':
          pattern = filters.tournamentId ? `^scoring:.*tournamentId:${filters.tournamentId}` : '^scoring:';
          break;
        case 'playerStats':
          pattern = filters.playerId ? `^player-stats:.*playerId:${filters.playerId}` : '^player-stats:';
          break;
        case 'bettingOdds':
          pattern = '^betting-odds:';
          break;
        case 'all':
          pattern = '.*';
          break;
        default:
          throw new Error(`Unknown data type: ${dataType}`);
      }

      const invalidated = await this.cache.invalidateByPattern(pattern);
      logger.info('Cache invalidation completed', { dataType, filters, invalidated });
      return invalidated;
    } catch (error) {
      logger.error('Cache invalidation failed', { dataType, filters, error: error.message });
      throw error;
    }
  }

  /**
   * Get service health status
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    try {
      const [apiHealth, cacheStats] = await Promise.all([
        this.client.healthCheck(),
        Promise.resolve(this.cache.getStats())
      ]);

      const circuitBreakerStatus = {
        state: this.circuitBreaker.state,
        failureCount: this.circuitBreaker.failureCount,
        successCount: this.circuitBreaker.successCount
      };

      return {
        status: apiHealth.status === 'healthy' ? 'healthy' : 'degraded',
        api: apiHealth,
        cache: cacheStats,
        circuitBreaker: circuitBreakerStatus,
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Health check failed', error);
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalRequests > 0
        ? this.metrics.cacheHits / this.metrics.totalRequests
        : 0,
      errorRate: this.metrics.totalRequests > 0
        ? this.metrics.errors / this.metrics.totalRequests
        : 0
    };
  }

  /**
   * Execute API call with caching, circuit breaker, and rate limiting
   * @param {Function} apiCall - Function that makes the API call
   * @param {string} cacheKey - Cache key
   * @param {boolean} useCache - Whether to use cache
   * @param {number} ttl - Cache TTL in seconds
   * @returns {Promise<Object>} API response
   * @private
   */
  async _executeWithCaching(apiCall, cacheKey, useCache, ttl) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    this.metrics.lastRequestTime = new Date().toISOString();

    try {
      // Check rate limiting
      if (!this._checkRateLimit()) {
        throw new Error('Rate limit exceeded');
      }

      // Check circuit breaker
      if (!this._checkCircuitBreaker()) {
        throw new Error('Circuit breaker is open');
      }

      // Try cache first
      if (useCache) {
        const cachedData = await this.cache.get(cacheKey);
        if (cachedData !== null) {
          this.metrics.cacheHits++;
          this._recordSuccess();
          this._updateResponseTime(startTime);
          return cachedData;
        }
        this.metrics.cacheMisses++;
      }

      // Make API call
      const data = await apiCall();

      // Cache the result
      if (useCache && data) {
        await this.cache.set(cacheKey, data, ttl);
      }

      this._recordSuccess();
      this._updateResponseTime(startTime);
      return data;

    } catch (error) {
      this.metrics.errors++;
      this._recordFailure();
      this._updateResponseTime(startTime);

      logger.error('Data Golf service error', {
        cacheKey,
        error: error.message,
        circuitBreakerState: this.circuitBreaker.state
      });

      throw error;
    }
  }

  /**
   * Check if request is within rate limits
   * @returns {boolean} Whether request is allowed
   * @private
   */
  _checkRateLimit() {
    const now = Date.now();

    // Remove old requests outside the window
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      timestamp => now - timestamp < this.rateLimiter.windowMs
    );

    // Check if we're under the limit
    if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
      return false;
    }

    // Add current request
    this.rateLimiter.requests.push(now);
    return true;
  }

  /**
   * Check circuit breaker state
   * @returns {boolean} Whether request is allowed
   * @private
   */
  _checkCircuitBreaker() {
    const now = Date.now();

    switch (this.circuitBreaker.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
          this.circuitBreaker.state = 'HALF_OPEN';
          this.circuitBreaker.successCount = 0;
          return true;
        }
        return false;

      case 'HALF_OPEN':
        return true;

      default:
        return true;
    }
  }

  /**
   * Record successful API call
   * @private
   */
  _recordSuccess() {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= this.circuitBreaker.resetThreshold) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
      }
    } else if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Record failed API call
   * @private
   */
  _recordFailure() {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.state = 'OPEN';
    }
  }

  /**
   * Update average response time
   * @param {number} startTime - Request start time
   * @private
   */
  _updateResponseTime(startTime) {
    const responseTime = Date.now() - startTime;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) /
      this.metrics.totalRequests;
  }
}

module.exports = DataGolfService;
