# Cache Management Module - Pseudocode Specification

## Module Overview
**Purpose**: Intelligent API response caching with TTL management, LRU eviction, and performance optimization
**Dependencies**: Database layer, Compression utilities, Configuration management
**Exports**: CacheManager, CacheKey generator, Cache statistics

## Core Algorithms

### 1. Cache Key Generation Algorithm

```pseudocode
FUNCTION generateCacheKey(endpoint, parameters, excludeKeys)
    // TEST: Should generate consistent keys for identical requests
    // TEST: Should exclude sensitive parameters like API keys
    // TEST: Should normalize parameter order for consistency

    PRECONDITION: endpoint is valid string
    PRECONDITION: parameters is object or null
    PRECONDITION: excludeKeys is array of strings

    BEGIN
        // Normalize endpoint URL
        normalizedEndpoint = normalizeUrl(endpoint)

        // Filter out excluded parameters (API keys, sensitive data)
        filteredParams = {}
        FOR each key, value in parameters
            IF key NOT IN excludeKeys THEN
                filteredParams[key] = value
            END IF
        END FOR

        // Sort parameters for consistent ordering
        sortedParams = sortObjectKeys(filteredParams)

        // Create deterministic string representation
        paramString = JSON.stringify(sortedParams)

        // Generate hash-based cache key
        cacheKey = generateHash(normalizedEndpoint + "|" + paramString)

        RETURN cacheKey
    END

    POSTCONDITION: cacheKey is unique 64-character string
    POSTCONDITION: identical inputs produce identical keys
END FUNCTION

// TEST: generateCacheKey with same params in different order returns same key
// TEST: generateCacheKey excludes API key from hash generation
// TEST: generateCacheKey handles null/undefined parameters gracefully
```

### 2. Cache Lookup and Storage Algorithm

```pseudocode
FUNCTION getCachedResponse(cacheKey)
    // TEST: Should return cached data if valid and not expired
    // TEST: Should return null for expired entries
    // TEST: Should update hit count and last accessed time

    PRECONDITION: cacheKey is valid string

    BEGIN
        cacheEntry = database.findByCacheKey(cacheKey)

        IF cacheEntry IS NULL THEN
            RETURN null
        END IF

        currentTime = getCurrentTimestamp()

        // Check if cache entry has expired
        IF cacheEntry.expiresAt < currentTime THEN
            // Mark as expired but don't delete immediately
            database.markExpired(cacheKey)
            RETURN null
        END IF

        // Update access statistics
        database.updateCacheHit(cacheKey, currentTime)

        // Decompress response data if needed
        responseData = decompressData(cacheEntry.responseData)

        RETURN {
            data: responseData,
            contentType: cacheEntry.contentType,
            cacheHit: true,
            cachedAt: cacheEntry.createdAt,
            hitCount: cacheEntry.hitCount + 1
        }
    END

    POSTCONDITION: Returns valid response object or null
END FUNCTION

// TEST: getCachedResponse returns null for non-existent keys
// TEST: getCachedResponse updates hit statistics on successful retrieval
// TEST: getCachedResponse handles decompression errors gracefully
```

### 3. Cache Storage Algorithm

```pseudocode
FUNCTION storeCacheEntry(cacheKey, responseData, contentType, ttlSeconds)
    // TEST: Should store compressed data with correct expiration
    // TEST: Should handle storage failures gracefully
    // TEST: Should trigger LRU eviction when storage limit reached

    PRECONDITION: cacheKey is valid string
    PRECONDITION: responseData is valid data
    PRECONDITION: ttlSeconds > 0

    BEGIN
        currentTime = getCurrentTimestamp()
        expirationTime = currentTime + (ttlSeconds * 1000)

        // Compress large responses for storage efficiency
        compressedData = compressData(responseData)
        originalSize = calculateDataSize(responseData)
        compressedSize = calculateDataSize(compressedData)

        // Check storage limits before insertion
        IF isStorageLimitExceeded() THEN
            evictLRUEntries()
        END IF

        cacheEntry = {
            cacheKey: cacheKey,
            endpoint: extractEndpointFromKey(cacheKey),
            responseData: compressedData,
            contentType: contentType,
            createdAt: currentTime,
            expiresAt: expirationTime,
            lastAccessedAt: currentTime,
            hitCount: 0,
            dataSize: originalSize,
            compressedSize: compressedSize,
            isValid: true,
            version: CACHE_SCHEMA_VERSION
        }

        TRY
            database.insertCacheEntry(cacheEntry)
            updateCacheStatistics(originalSize, compressedSize)
            RETURN true
        CATCH StorageException
            logError("Cache storage failed", cacheKey, error)
            RETURN false
        END TRY
    END

    POSTCONDITION: Cache entry stored or error logged
END FUNCTION

// TEST: storeCacheEntry compresses data above threshold size
// TEST: storeCacheEntry calculates correct expiration time
// TEST: storeCacheEntry triggers eviction when storage full
```

### 4. LRU Eviction Algorithm

```pseudocode
FUNCTION evictLRUEntries()
    // TEST: Should remove least recently used entries first
    // TEST: Should free sufficient space for new entries
    // TEST: Should preserve high-value cache entries when possible

    BEGIN
        targetEvictionSize = calculateEvictionTarget()
        freedSpace = 0

        // Get candidates ordered by LRU with hit count weighting
        evictionCandidates = database.getLRUCandidates(
            orderBy: ["lastAccessedAt ASC", "hitCount ASC"],
            excludeRecent: 300000  // Don't evict entries accessed in last 5 minutes
        )

        FOR each candidate in evictionCandidates
            IF freedSpace >= targetEvictionSize THEN
                BREAK
            END IF

            // Calculate eviction score (lower = more likely to evict)
            evictionScore = calculateEvictionScore(candidate)

            IF evictionScore < EVICTION_THRESHOLD THEN
                database.deleteCacheEntry(candidate.cacheKey)
                freedSpace += candidate.compressedSize
                logCacheEviction(candidate.cacheKey, "LRU")
            END IF
        END FOR

        updateCacheStatistics(-freedSpace, 0)

        RETURN freedSpace
    END

    POSTCONDITION: Sufficient space freed for new entries
END FUNCTION

// TEST: evictLRUEntries preserves recently accessed entries
// TEST: evictLRUEntries considers hit count in eviction decisions
// TEST: evictLRUEntries logs eviction events for monitoring
```

### 5. Cache Invalidation Algorithm

```pseudocode
FUNCTION invalidateCache(pattern, reason)
    // TEST: Should invalidate entries matching pattern
    // TEST: Should support wildcard and regex patterns
    // TEST: Should log invalidation events for audit

    PRECONDITION: pattern is valid string or regex
    PRECONDITION: reason is descriptive string

    BEGIN
        invalidatedCount = 0

        IF pattern == "*" THEN
            // Clear all cache entries
            invalidatedCount = database.clearAllCache()
        ELSE IF isRegexPattern(pattern) THEN
            // Pattern-based invalidation
            matchingEntries = database.findCacheByPattern(pattern)
            FOR each entry in matchingEntries
                database.markInvalid(entry.cacheKey)
                invalidatedCount++
            END FOR
        ELSE
            // Exact key invalidation
            IF database.cacheExists(pattern) THEN
                database.markInvalid(pattern)
                invalidatedCount = 1
            END IF
        END IF

        logCacheInvalidation(pattern, reason, invalidatedCount)

        RETURN invalidatedCount
    END

    POSTCONDITION: Matching cache entries invalidated
END FUNCTION

// TEST: invalidateCache handles wildcard patterns correctly
// TEST: invalidateCache logs invalidation events with reason
// TEST: invalidateCache returns accurate count of invalidated entries
```

## Cache Configuration Management

### 6. TTL Calculation Algorithm

```pseudocode
FUNCTION calculateTTL(endpoint, responseSize, requestFrequency)
    // TEST: Should return appropriate TTL based on endpoint type
    // TEST: Should adjust TTL based on data volatility
    // TEST: Should respect minimum and maximum TTL limits

    PRECONDITION: endpoint is valid string
    PRECONDITION: responseSize >= 0
    PRECONDITION: requestFrequency >= 0

    BEGIN
        // Base TTL by endpoint category
        baseTTL = getBaseTTLForEndpoint(endpoint)

        // Adjust based on data characteristics
        IF isRealTimeData(endpoint) THEN
            ttlMultiplier = 0.5  // Shorter TTL for live data
        ELSE IF isHistoricalData(endpoint) THEN
            ttlMultiplier = 2.0  // Longer TTL for historical data
        ELSE
            ttlMultiplier = 1.0
        END IF

        // Adjust based on request frequency (popular data cached longer)
        frequencyMultiplier = min(1.0 + (requestFrequency / 100), 2.0)

        // Adjust based on response size (larger responses cached longer)
        sizeMultiplier = min(1.0 + (responseSize / 1000000), 1.5)

        calculatedTTL = baseTTL * ttlMultiplier * frequencyMultiplier * sizeMultiplier

        // Enforce TTL limits
        finalTTL = clamp(calculatedTTL, MIN_TTL_SECONDS, MAX_TTL_SECONDS)

        RETURN finalTTL
    END

    POSTCONDITION: TTL within configured limits
END FUNCTION

// TEST: calculateTTL returns shorter TTL for real-time endpoints
// TEST: calculateTTL increases TTL for frequently requested data
// TEST: calculateTTL respects minimum and maximum TTL boundaries
```

### 7. Cache Health Monitoring

```pseudocode
FUNCTION monitorCacheHealth()
    // TEST: Should calculate accurate cache statistics
    // TEST: Should detect performance degradation
    // TEST: Should trigger alerts for anomalies

    BEGIN
        currentTime = getCurrentTimestamp()

        // Calculate cache metrics
        totalEntries = database.countCacheEntries()
        totalSize = database.sumCacheSize()
        hitRate = calculateHitRate(timeWindow: 3600000)  // Last hour
        avgResponseTime = calculateAvgResponseTime(timeWindow: 3600000)

        // Check for performance issues
        IF hitRate < MIN_HIT_RATE_THRESHOLD THEN
            triggerAlert("Low cache hit rate", hitRate)
        END IF

        IF avgResponseTime > MAX_RESPONSE_TIME_THRESHOLD THEN
            triggerAlert("High cache response time", avgResponseTime)
        END IF

        IF totalSize > STORAGE_WARNING_THRESHOLD THEN
            triggerAlert("Cache storage approaching limit", totalSize)
        END IF

        // Update health metrics
        healthMetrics = {
            timestamp: currentTime,
            totalEntries: totalEntries,
            totalSize: totalSize,
            hitRate: hitRate,
            avgResponseTime: avgResponseTime,
            storageUtilization: totalSize / MAX_STORAGE_SIZE
        }

        database.recordHealthMetrics(healthMetrics)

        RETURN healthMetrics
    END

    POSTCONDITION: Health metrics recorded and alerts triggered if needed
END FUNCTION

// TEST: monitorCacheHealth calculates correct hit rate
// TEST: monitorCacheHealth triggers alerts for threshold violations
// TEST: monitorCacheHealth records metrics for historical analysis
```

## Cache Warming and Preloading

### 8. Cache Warming Algorithm

```pseudocode
FUNCTION warmCache(popularEndpoints, priority)
    // TEST: Should preload frequently accessed endpoints
    // TEST: Should respect rate limits during warming
    // TEST: Should handle warming failures gracefully

    PRECONDITION: popularEndpoints is array of endpoint configurations
    PRECONDITION: priority is "high", "medium", or "low"

    BEGIN
        warmingResults = []
        rateLimiter = createRateLimiter(priority)

        FOR each endpointConfig in popularEndpoints
            IF rateLimiter.canProceed() THEN
                TRY
                    // Generate cache key for endpoint
                    cacheKey = generateCacheKey(
                        endpointConfig.endpoint,
                        endpointConfig.parameters,
                        EXCLUDED_CACHE_KEYS
                    )

                    // Check if already cached
                    IF NOT isCached(cacheKey) THEN
                        // Fetch from external API
                        response = fetchFromExternalAPI(
                            endpointConfig.endpoint,
                            endpointConfig.parameters
                        )

                        // Store in cache
                        ttl = calculateTTL(
                            endpointConfig.endpoint,
                            response.size,
                            endpointConfig.frequency
                        )

                        success = storeCacheEntry(
                            cacheKey,
                            response.data,
                            response.contentType,
                            ttl
                        )

                        warmingResults.push({
                            endpoint: endpointConfig.endpoint,
                            success: success,
                            cacheKey: cacheKey
                        })
                    END IF

                    rateLimiter.recordRequest()

                CATCH Exception as error
                    logError("Cache warming failed", endpointConfig, error)
                    warmingResults.push({
                        endpoint: endpointConfig.endpoint,
                        success: false,
                        error: error.message
                    })
                END TRY
            END IF
        END FOR

        logCacheWarming(warmingResults, priority)

        RETURN warmingResults
    END

    POSTCONDITION: Popular endpoints preloaded or errors logged
END FUNCTION

// TEST: warmCache respects rate limiting during preloading
// TEST: warmCache skips already cached endpoints
// TEST: warmCache logs warming results for monitoring
```

## Error Handling and Recovery

### 9. Cache Recovery Algorithm

```pseudocode
FUNCTION recoverFromCacheFailure(failureType, context)
    // TEST: Should handle database connection failures
    // TEST: Should provide fallback mechanisms
    // TEST: Should maintain service availability during recovery

    PRECONDITION: failureType is valid failure category
    PRECONDITION: context contains failure details

    BEGIN
        recoveryStrategy = determineRecoveryStrategy(failureType)

        SWITCH recoveryStrategy
            CASE "database_reconnect":
                success = attemptDatabaseReconnection()
                IF success THEN
                    RETURN "recovered"
                ELSE
                    RETURN "fallback_mode"
                END IF

            CASE "fallback_mode":
                enableFallbackMode()
                RETURN "fallback_active"

            CASE "cache_rebuild":
                scheduleAsyncCacheRebuild()
                RETURN "rebuilding"

            CASE "graceful_degradation":
                disableNonEssentialCaching()
                RETURN "degraded"

            DEFAULT:
                logError("Unknown failure type", failureType, context)
                RETURN "unknown_failure"
        END SWITCH
    END

    POSTCONDITION: Recovery action initiated or fallback enabled
END FUNCTION

// TEST: recoverFromCacheFailure handles database connection loss
// TEST: recoverFromCacheFailure enables appropriate fallback modes
// TEST: recoverFromCacheFailure logs recovery actions for monitoring
```

## Performance Optimization

### 10. Cache Compression Algorithm

```pseudocode
FUNCTION compressData(data, compressionLevel)
    // TEST: Should compress data above size threshold
    // TEST: Should choose optimal compression algorithm
    // TEST: Should handle compression failures gracefully

    PRECONDITION: data is valid response data
    PRECONDITION: compressionLevel is 1-9

    BEGIN
        dataSize = calculateDataSize(data)

        // Only compress if data exceeds threshold
        IF dataSize < COMPRESSION_THRESHOLD THEN
            RETURN {
                compressed: false,
                data: data,
                originalSize: dataSize,
                compressedSize: dataSize,
                algorithm: "none"
            }
        END IF

        // Choose compression algorithm based on data type
        algorithm = selectCompressionAlgorithm(data)

        TRY
            compressedData = compress(data, algorithm, compressionLevel)
            compressedSize = calculateDataSize(compressedData)

            // Verify compression benefit
            compressionRatio = compressedSize / dataSize

            IF compressionRatio > MAX_COMPRESSION_RATIO THEN
                // Compression not beneficial, store uncompressed
                RETURN {
                    compressed: false,
                    data: data,
                    originalSize: dataSize,
                    compressedSize: dataSize,
                    algorithm: "none"
                }
            END IF

            RETURN {
                compressed: true,
                data: compressedData,
                originalSize: dataSize,
                compressedSize: compressedSize,
                algorithm: algorithm
            }

        CATCH CompressionException as error
            logError("Compression failed", algorithm, error)
            RETURN {
                compressed: false,
                data: data,
                originalSize: dataSize,
                compressedSize: dataSize,
                algorithm: "none"
            }
        END TRY
    END

    POSTCONDITION: Data compressed or returned uncompressed with metadata
END FUNCTION

// TEST: compressData skips compression for small data
// TEST: compressData chooses appropriate algorithm for data type
// TEST: compressData falls back to uncompressed on compression failure
```

## Module Configuration

```pseudocode
CONSTANTS:
    CACHE_SCHEMA_VERSION = "1.0"
    MIN_TTL_SECONDS = 300        // 5 minutes
    MAX_TTL_SECONDS = 86400      // 24 hours
    COMPRESSION_THRESHOLD = 1024  // 1KB
    MAX_COMPRESSION_RATIO = 0.9   // Don't compress if < 10% savings
    EVICTION_THRESHOLD = 0.3      // Eviction score threshold
    MIN_HIT_RATE_THRESHOLD = 0.6  // 60% minimum hit rate
    MAX_RESPONSE_TIME_THRESHOLD = 100  // 100ms max response time
    STORAGE_WARNING_THRESHOLD = 0.8    // 80% storage utilization warning
    EXCLUDED_CACHE_KEYS = ["key", "api_key", "token", "secret"]

CONFIGURATION:
    maxStorageSize: from environment variable
    defaultTTL: from configuration file
    compressionLevel: from configuration file
    evictionPolicy: "LRU" | "LFU" | "FIFO"
    monitoringInterval: from configuration file
