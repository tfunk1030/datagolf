/**
 * Multi-Level Cache Service
 * Implements L1 (memory), L2 (Redis-like), and L3 (persistent) caching
 * Provides cache invalidation, TTL management, and performance monitoring
 */

const { getConfig } = require('../config/environment');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.config = getConfig();
    this.cacheConfig = this.config.cache;

    // L1 Cache - In-memory LRU cache
    this.l1Cache = new Map();
    this.l1AccessOrder = new Map();
    this.l1Stats = { hits: 0, misses: 0, evictions: 0 };

    // L2 Cache - Simulated Redis-like cache (in production, use actual Redis)
    this.l2Cache = new Map();
    this.l2Stats = { hits: 0, misses: 0, evictions: 0 };

    // L3 Cache - Persistent storage simulation
    this.l3Cache = new Map();
    this.l3Stats = { hits: 0, misses: 0, evictions: 0 };

    // TTL tracking
    this.ttlTimers = new Map();

    // Cache key patterns for different data types
    this.keyPatterns = {
      tournament: 'tournament:',
      rankings: 'rankings:',
      field: 'field:',
      scoring: 'scoring:',
      playerStats: 'player-stats:',
      bettingOdds: 'betting-odds:'
    };

    this._initializeCleanupInterval();
  }

  /**
   * Initialize periodic cleanup for expired entries
   * @private
   */
  _initializeCleanupInterval() {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this._cleanupExpiredEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Generate cache key with pattern and parameters
   * @param {string} pattern - Cache key pattern
   * @param {Object} params - Parameters to include in key
   * @returns {string} Generated cache key
   */
  generateKey(pattern, params = {}) {
    const baseKey = this.keyPatterns[pattern] || pattern;
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');

    return paramString ? `${baseKey}${paramString}` : baseKey.slice(0, -1);
  }

  /**
   * Get data from cache with fallback through cache levels
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Cached data or null
   */
  async get(key) {
    const startTime = Date.now();

    try {
      // Try L1 cache first
      if (this.cacheConfig.l1.enabled) {
        const l1Result = this._getFromL1(key);
        if (l1Result !== null) {
          this._recordCacheHit('L1', startTime);
          return l1Result;
        }
      }

      // Try L2 cache
      if (this.cacheConfig.l2.enabled) {
        const l2Result = this._getFromL2(key);
        if (l2Result !== null) {
          // Promote to L1
          if (this.cacheConfig.l1.enabled) {
            this._setToL1(key, l2Result, this.cacheConfig.l1.ttl);
          }
          this._recordCacheHit('L2', startTime);
          return l2Result;
        }
      }

      // Try L3 cache
      if (this.cacheConfig.l3.enabled) {
        const l3Result = this._getFromL3(key);
        if (l3Result !== null) {
          // Promote to L2 and L1
          if (this.cacheConfig.l2.enabled) {
            this._setToL2(key, l3Result, this.cacheConfig.l2.ttl);
          }
          if (this.cacheConfig.l1.enabled) {
            this._setToL1(key, l3Result, this.cacheConfig.l1.ttl);
          }
          this._recordCacheHit('L3', startTime);
          return l3Result;
        }
      }

      this._recordCacheMiss(startTime);
      return null;
    } catch (error) {
      logger.error('Cache get error', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set data in cache across all enabled levels
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<boolean>} Success status
   */
  async set(key, data, ttl = null) {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        ttl: ttl || this.cacheConfig.l1.ttl,
        accessCount: 0
      };

      // Set in L1 cache
      if (this.cacheConfig.l1.enabled) {
        this._setToL1(key, cacheEntry, ttl || this.cacheConfig.l1.ttl);
      }

      // Set in L2 cache
      if (this.cacheConfig.l2.enabled) {
        this._setToL2(key, cacheEntry, ttl || this.cacheConfig.l2.ttl);
      }

      // Set in L3 cache
      if (this.cacheConfig.l3.enabled) {
        this._setToL3(key, cacheEntry, ttl || this.cacheConfig.l3.ttl);
      }

      logger.debug('Cache set successful', { key, ttl });
      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Delete data from all cache levels
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Success status
   */
  async delete(key) {
    try {
      let deleted = false;

      if (this.l1Cache.has(key)) {
        this.l1Cache.delete(key);
        this.l1AccessOrder.delete(key);
        deleted = true;
      }

      if (this.l2Cache.has(key)) {
        this.l2Cache.delete(key);
        deleted = true;
      }

      if (this.l3Cache.has(key)) {
        this.l3Cache.delete(key);
        deleted = true;
      }

      // Clear TTL timer
      if (this.ttlTimers.has(key)) {
        clearTimeout(this.ttlTimers.get(key));
        this.ttlTimers.delete(key);
      }

      logger.debug('Cache delete', { key, deleted });
      return deleted;
    } catch (error) {
      logger.error('Cache delete error', { key, error: error.message });
      return false;
    }
  }

  /**
   * Invalidate cache entries by pattern
   * @param {string} pattern - Pattern to match keys
   * @returns {Promise<number>} Number of invalidated entries
   */
  async invalidateByPattern(pattern) {
    try {
      let invalidated = 0;
      const regex = new RegExp(pattern);

      // Invalidate from all cache levels
      for (const key of this.l1Cache.keys()) {
        if (regex.test(key)) {
          await this.delete(key);
          invalidated++;
        }
      }

      for (const key of this.l2Cache.keys()) {
        if (regex.test(key) && !this.l1Cache.has(key)) {
          await this.delete(key);
          invalidated++;
        }
      }

      for (const key of this.l3Cache.keys()) {
        if (regex.test(key) && !this.l1Cache.has(key) && !this.l2Cache.has(key)) {
          await this.delete(key);
          invalidated++;
        }
      }

      logger.info('Cache invalidation by pattern', { pattern, invalidated });
      return invalidated;
    } catch (error) {
      logger.error('Cache invalidation error', { pattern, error: error.message });
      return 0;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      l1: {
        ...this.l1Stats,
        size: this.l1Cache.size,
        maxSize: this.cacheConfig.l1.maxSize,
        hitRate: this.l1Stats.hits / (this.l1Stats.hits + this.l1Stats.misses) || 0
      },
      l2: {
        ...this.l2Stats,
        size: this.l2Cache.size,
        maxSize: this.cacheConfig.l2.maxSize,
        hitRate: this.l2Stats.hits / (this.l2Stats.hits + this.l2Stats.misses) || 0
      },
      l3: {
        ...this.l3Stats,
        size: this.l3Cache.size,
        maxSize: this.cacheConfig.l3.maxSize,
        hitRate: this.l3Stats.hits / (this.l3Stats.hits + this.l3Stats.misses) || 0
      },
      overall: {
        totalHits: this.l1Stats.hits + this.l2Stats.hits + this.l3Stats.hits,
        totalMisses: this.l1Stats.misses + this.l2Stats.misses + this.l3Stats.misses,
        totalEvictions: this.l1Stats.evictions + this.l2Stats.evictions + this.l3Stats.evictions
      }
    };
  }

  /**
   * Clear all cache levels
   * @returns {Promise<boolean>} Success status
   */
  async clear() {
    try {
      this.l1Cache.clear();
      this.l1AccessOrder.clear();
      this.l2Cache.clear();
      this.l3Cache.clear();

      // Clear all TTL timers
      for (const timer of this.ttlTimers.values()) {
        clearTimeout(timer);
      }
      this.ttlTimers.clear();

      // Reset stats
      this.l1Stats = { hits: 0, misses: 0, evictions: 0 };
      this.l2Stats = { hits: 0, misses: 0, evictions: 0 };
      this.l3Stats = { hits: 0, misses: 0, evictions: 0 };

      logger.info('Cache cleared successfully');
      return true;
    } catch (error) {
      logger.error('Cache clear error', error);
      return false;
    }
  }

  // L1 Cache Methods (In-Memory LRU)
  _getFromL1(key) {
    if (!this.l1Cache.has(key)) {
      this.l1Stats.misses++;
      return null;
    }

    const entry = this.l1Cache.get(key);
    if (this._isExpired(entry)) {
      this.l1Cache.delete(key);
      this.l1AccessOrder.delete(key);
      this.l1Stats.misses++;
      return null;
    }

    // Update access order for LRU
    this.l1AccessOrder.delete(key);
    this.l1AccessOrder.set(key, Date.now());
    entry.accessCount++;

    this.l1Stats.hits++;
    return entry.data;
  }

  _setToL1(key, data, ttl) {
    // Check if we need to evict
    if (this.l1Cache.size >= this.cacheConfig.l1.maxSize) {
      this._evictFromL1();
    }

    const entry = typeof data === 'object' && data.timestamp ? data : {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0
    };

    this.l1Cache.set(key, entry);
    this.l1AccessOrder.set(key, Date.now());

    // Set TTL timer
    if (ttl) {
      this._setTTLTimer(key, ttl);
    }
  }

  _evictFromL1() {
    // Evict least recently used item
    const oldestKey = this.l1AccessOrder.keys().next().value;
    if (oldestKey) {
      this.l1Cache.delete(oldestKey);
      this.l1AccessOrder.delete(oldestKey);
      this.l1Stats.evictions++;
    }
  }

  // L2 Cache Methods (Redis-like)
  _getFromL2(key) {
    if (!this.l2Cache.has(key)) {
      this.l2Stats.misses++;
      return null;
    }

    const entry = this.l2Cache.get(key);
    if (this._isExpired(entry)) {
      this.l2Cache.delete(key);
      this.l2Stats.misses++;
      return null;
    }

    entry.accessCount++;
    this.l2Stats.hits++;
    return entry.data;
  }

  _setToL2(key, data, ttl) {
    if (this.l2Cache.size >= this.cacheConfig.l2.maxSize) {
      this._evictFromL2();
    }

    const entry = typeof data === 'object' && data.timestamp ? data : {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0
    };

    this.l2Cache.set(key, entry);
  }

  _evictFromL2() {
    // Simple FIFO eviction for L2
    const firstKey = this.l2Cache.keys().next().value;
    if (firstKey) {
      this.l2Cache.delete(firstKey);
      this.l2Stats.evictions++;
    }
  }

  // L3 Cache Methods (Persistent)
  _getFromL3(key) {
    if (!this.l3Cache.has(key)) {
      this.l3Stats.misses++;
      return null;
    }

    const entry = this.l3Cache.get(key);
    if (this._isExpired(entry)) {
      this.l3Cache.delete(key);
      this.l3Stats.misses++;
      return null;
    }

    entry.accessCount++;
    this.l3Stats.hits++;
    return entry.data;
  }

  _setToL3(key, data, ttl) {
    if (this.l3Cache.size >= this.cacheConfig.l3.maxSize) {
      this._evictFromL3();
    }

    const entry = typeof data === 'object' && data.timestamp ? data : {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0
    };

    this.l3Cache.set(key, entry);
  }

  _evictFromL3() {
    // LFU eviction for L3 (least frequently used)
    let leastUsedKey = null;
    let leastUsedCount = Infinity;

    for (const [key, entry] of this.l3Cache.entries()) {
      if (entry.accessCount < leastUsedCount) {
        leastUsedCount = entry.accessCount;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      this.l3Cache.delete(leastUsedKey);
      this.l3Stats.evictions++;
    }
  }

  // Utility Methods
  _isExpired(entry) {
    if (!entry.ttl) return false;
    return Date.now() - entry.timestamp > (entry.ttl * 1000);
  }

  _setTTLTimer(key, ttl) {
    if (this.ttlTimers.has(key)) {
      clearTimeout(this.ttlTimers.get(key));
    }

    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl * 1000);

    this.ttlTimers.set(key, timer);
  }

  _cleanupExpiredEntries() {
    const now = Date.now();
    let cleaned = 0;

    // Clean L1
    for (const [key, entry] of this.l1Cache.entries()) {
      if (this._isExpired(entry)) {
        this.l1Cache.delete(key);
        this.l1AccessOrder.delete(key);
        cleaned++;
      }
    }

    // Clean L2
    for (const [key, entry] of this.l2Cache.entries()) {
      if (this._isExpired(entry)) {
        this.l2Cache.delete(key);
        cleaned++;
      }
    }

    // Clean L3
    for (const [key, entry] of this.l3Cache.entries()) {
      if (this._isExpired(entry)) {
        this.l3Cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cache cleanup completed', { entriesRemoved: cleaned });
    }
  }

  _recordCacheHit(level, startTime) {
    const responseTime = Date.now() - startTime;
    logger.debug('Cache hit', { level, responseTime });
  }

  _recordCacheMiss(startTime) {
    const responseTime = Date.now() - startTime;
    logger.debug('Cache miss', { responseTime });
  }
}

module.exports = CacheService;
