# API Gateway and Analytics Module - Pseudocode Specification

## Module Overview
**Purpose**: Intelligent API gateway with request routing, analytics collection, and real-time monitoring
**Dependencies**: Cache management, Database layer, External API client, Session management
**Exports**: APIGateway, AnalyticsCollector, RequestRouter, MonitoringService

## Core Request Processing

### 1. Request Routing and Validation Algorithm

```pseudocode
FUNCTION processAPIRequest(request, sessionId)
    // TEST: Should validate request parameters and route correctly
    // TEST: Should handle malformed requests gracefully
    // TEST: Should apply rate limiting per session

    PRECONDITION: request contains valid HTTP request data
    PRECONDITION: sessionId is valid session identifier

    BEGIN
        requestId = generateRequestId()
        startTime = getCurrentTimestamp()

        // Log incoming request
        logRequestStart(requestId, request, sessionId, startTime)

        TRY
            // Validate request structure
            validationResult = validateRequest(request)
            IF NOT validationResult.isValid THEN
                RETURN createErrorResponse(400, validationResult.errors, requestId)
            END IF

            // Extract and validate endpoint
            endpoint = extractEndpoint(request.url)
            parameters = extractParameters(request.query, request.body)

            // Check rate limiting
            IF isRateLimited(sessionId, endpoint) THEN
                logRateLimitExceeded(requestId, sessionId, endpoint)
                RETURN createErrorResponse(429, "Rate limit exceeded", requestId)
            END IF

            // Generate cache key
            cacheKey = generateCacheKey(endpoint, parameters, EXCLUDED_CACHE_KEYS)

            // Check cache first
            cachedResponse = getCachedResponse(cacheKey)
            IF cachedResponse IS NOT NULL THEN
                response = createSuccessResponse(cachedResponse.data, requestId, true)
                logRequestComplete(requestId, 200, getCurrentTimestamp() - startTime, true)
                recordAnalyticsEvent(requestId, sessionId, endpoint, parameters, "cache_hit")
                RETURN response
            END IF

            // Forward to external API
            externalResponse = forwardToExternalAPI(endpoint, parameters, request.headers)

            // Process and cache response
            processedResponse = processExternalResponse(externalResponse, cacheKey, endpoint)

            // Log completion
            responseTime = getCurrentTimestamp() - startTime
            logRequestComplete(requestId, externalResponse.status, responseTime, false)
            recordAnalyticsEvent(requestId, sessionId, endpoint, parameters, "api_call")

            RETURN processedResponse

        CATCH ValidationException as error
            logRequestError(requestId, "validation_error", error)
            RETURN createErrorResponse(400, error.message, requestId)

        CATCH RateLimitException as error
            logRequestError(requestId, "rate_limit", error)
            RETURN createErrorResponse(429, "Rate limit exceeded", requestId)

        CATCH ExternalAPIException as error
            logRequestError(requestId, "external_api_error", error)
            // Try to serve stale cache if available
            staleResponse = getStaleCache(cacheKey)
            IF staleResponse IS NOT NULL THEN
                RETURN createSuccessResponse(staleResponse.data, requestId, true, "stale")
            END IF
            RETURN createErrorResponse(502, "External API unavailable", requestId)

        CATCH Exception as error
            logRequestError(requestId, "internal_error", error)
            RETURN createErrorResponse(500, "Internal server error", requestId)
        END TRY
    END

    POSTCONDITION: Valid HTTP response returned and analytics recorded
END FUNCTION

// TEST: processAPIRequest handles cache hits correctly
// TEST: processAPIRequest forwards to external API on cache miss
// TEST: processAPIRequest applies rate limiting per session
// TEST: processAPIRequest serves stale cache on external API failure
```

### 2. External API Integration Algorithm

```pseudocode
FUNCTION forwardToExternalAPI(endpoint, parameters, headers)
    // TEST: Should construct correct Data Golf API URLs
    // TEST: Should handle API authentication properly
    // TEST: Should implement retry logic for transient failures

    PRECONDITION: endpoint is valid Data Golf API endpoint
    PRECONDITION: parameters is validated parameter object
    PRECONDITION: headers contains request headers

    BEGIN
        // Construct external API URL
        externalUrl = buildDataGolfURL(endpoint, parameters)

        // Prepare request headers
        requestHeaders = prepareHeaders(headers)
        requestHeaders["Authorization"] = getAPIKeyFromConfig()
        requestHeaders["User-Agent"] = getUserAgentString()

        retryCount = 0
        maxRetries = getMaxRetries()

        WHILE retryCount <= maxRetries
            TRY
                // Make HTTP request to Data Golf API
                response = makeHTTPRequest(
                    method: "GET",
                    url: externalUrl,
                    headers: requestHeaders,
                    timeout: getRequestTimeout()
                )

                // Validate response
                IF response.status >= 200 AND response.status < 300 THEN
                    // Success - validate response data
                    validatedData = validateResponseData(response.data, endpoint)
                    RETURN {
                        status: response.status,
                        data: validatedData,
                        headers: response.headers,
                        size: calculateDataSize(validatedData)
                    }
                ELSE IF response.status == 429 THEN
                    // Rate limited - wait and retry
                    waitTime = calculateBackoffTime(retryCount)
                    sleep(waitTime)
                    retryCount++
                ELSE IF response.status >= 500 THEN
                    // Server error - retry
                    retryCount++
                ELSE
                    // Client error - don't retry
                    THROW ExternalAPIException("Client error: " + response.status)
                END IF

            CATCH NetworkException as error
                retryCount++
                IF retryCount > maxRetries THEN
                    THROW ExternalAPIException("Network error after retries: " + error.message)
                END IF
                sleep(calculateBackoffTime(retryCount))

            CATCH TimeoutException as error
                retryCount++
                IF retryCount > maxRetries THEN
                    THROW ExternalAPIException("Timeout after retries: " + error.message)
                END IF
                sleep(calculateBackoffTime(retryCount))
            END TRY
        END WHILE

        THROW ExternalAPIException("Max retries exceeded")
    END

    POSTCONDITION: Valid response returned or exception thrown
END FUNCTION

// TEST: forwardToExternalAPI constructs correct URLs for all endpoints
// TEST: forwardToExternalAPI implements exponential backoff on retries
// TEST: forwardToExternalAPI handles rate limiting from external API
```

### 3. Response Processing and Caching Algorithm

```pseudocode
FUNCTION processExternalResponse(externalResponse, cacheKey, endpoint)
    // TEST: Should cache successful responses with appropriate TTL
    // TEST: Should apply data transformations if requested
    // TEST: Should handle response validation errors

    PRECONDITION: externalResponse contains valid API response
    PRECONDITION: cacheKey is valid cache identifier
    PRECONDITION: endpoint is valid endpoint string

    BEGIN
        // Validate response data structure
        validationResult = validateResponseStructure(externalResponse.data, endpoint)
        IF NOT validationResult.isValid THEN
            logResponseValidationError(cacheKey, endpoint, validationResult.errors)
            // Continue with response but mark as potentially invalid
        END IF

        // Apply data transformations if needed
        transformedData = applyDataTransformations(externalResponse.data, endpoint)

        // Calculate TTL for caching
        ttl = calculateTTL(
            endpoint,
            externalResponse.size,
            getEndpointRequestFrequency(endpoint)
        )

        // Store in cache if successful response
        IF externalResponse.status >= 200 AND externalResponse.status < 300 THEN
            cacheSuccess = storeCacheEntry(
                cacheKey,
                transformedData,
                externalResponse.headers["content-type"] || "application/json",
                ttl
            )

            IF NOT cacheSuccess THEN
                logCacheStorageFailure(cacheKey, endpoint)
            END IF
        END IF

        // Add response metadata
        responseMetadata = {
            requestId: getCurrentRequestId(),
            cached: false,
            cacheKey: cacheKey,
            processingTime: getCurrentTimestamp() - getRequestStartTime(),
            dataSize: externalResponse.size,
            ttl: ttl,
            transformationsApplied: getAppliedTransformations()
        }

        // Create final response
        finalResponse = {
            status: externalResponse.status,
            data: transformedData,
            headers: enhanceResponseHeaders(externalResponse.headers, responseMetadata),
            metadata: responseMetadata
        }

        RETURN finalResponse
    END

    POSTCONDITION: Response processed and cached if appropriate
END FUNCTION

// TEST: processExternalResponse caches successful responses
// TEST: processExternalResponse applies transformations correctly
// TEST: processExternalResponse adds appropriate metadata
```

## Analytics Collection System

### 4. Analytics Event Recording Algorithm

```pseudocode
FUNCTION recordAnalyticsEvent(requestId, sessionId, endpoint, parameters, eventType)
    // TEST: Should record all required analytics data
    // TEST: Should sanitize sensitive information
    // TEST: Should handle high-volume event recording

    PRECONDITION: requestId is valid request identifier
    PRECONDITION: sessionId is valid session identifier
    PRECONDITION: endpoint is valid endpoint string
    PRECONDITION: eventType is valid event category

    BEGIN
        currentTime = getCurrentTimestamp()

        // Sanitize parameters (remove sensitive data)
        sanitizedParams = sanitizeParameters(parameters, SENSITIVE_PARAM_KEYS)

        // Create analytics event
        analyticsEvent = {
            eventId: generateEventId(),
            requestId: requestId,
            sessionId: sessionId,
            eventType: eventType,
            eventName: deriveEventName(eventType, endpoint),
            timestamp: currentTime,
            endpoint: endpoint,
            parameters: sanitizedParams,
            userAgent: getCurrentUserAgent(),
            ipAddress: getCurrentIPAddress(),
            responseTime: getCurrentResponseTime(),
            cacheHit: getCurrentCacheHitStatus(),
            errorCode: getCurrentErrorCode(),
            dataSize: getCurrentDataSize()
        }

        // Record event asynchronously to avoid blocking request
        TRY
            queueAnalyticsEvent(analyticsEvent)

            // Update real-time metrics
            updateRealTimeMetrics(eventType, endpoint, analyticsEvent)

        CATCH Exception as error
            // Analytics failure should not affect main request
            logAnalyticsError("Failed to record analytics event", error, analyticsEvent)
        END TRY
    END

    POSTCONDITION: Analytics event queued for processing
END FUNCTION

// TEST: recordAnalyticsEvent sanitizes sensitive parameters
// TEST: recordAnalyticsEvent updates real-time metrics
// TEST: recordAnalyticsEvent handles recording failures gracefully
```

### 5. Real-time Metrics Calculation Algorithm

```pseudocode
FUNCTION updateRealTimeMetrics(eventType, endpoint, eventData)
    // TEST: Should update metrics within performance thresholds
    // TEST: Should trigger alerts for anomalies
    // TEST: Should maintain accurate rolling averages

    PRECONDITION: eventType is valid event category
    PRECONDITION: endpoint is valid endpoint string
    PRECONDITION: eventData contains complete event information

    BEGIN
        currentTime = getCurrentTimestamp()
        timeWindow = getRealTimeWindow()  // e.g., last 5 minutes

        // Update request count metrics
        incrementMetric("requests_total", endpoint, 1)
        incrementMetric("requests_by_type", eventType, 1)

        // Update response time metrics
        IF eventData.responseTime IS NOT NULL THEN
            updateRollingAverage("response_time", endpoint, eventData.responseTime, timeWindow)

            // Check for performance alerts
            avgResponseTime = getRollingAverage("response_time", endpoint, timeWindow)
            IF avgResponseTime > getResponseTimeThreshold(endpoint) THEN
                triggerPerformanceAlert("high_response_time", endpoint, avgResponseTime)
            END IF
        END IF

        // Update cache metrics
        IF eventData.cacheHit IS NOT NULL THEN
            incrementMetric("cache_requests", endpoint, 1)
            IF eventData.cacheHit THEN
                incrementMetric("cache_hits", endpoint, 1)
            END IF

            // Calculate and check cache hit rate
            hitRate = calculateCacheHitRate(endpoint, timeWindow)
            IF hitRate < getCacheHitRateThreshold() THEN
                triggerPerformanceAlert("low_cache_hit_rate", endpoint, hitRate)
            END IF
        END IF

        // Update error metrics
        IF eventData.errorCode IS NOT NULL THEN
            incrementMetric("errors_total", endpoint, 1)
            incrementMetric("errors_by_code", eventData.errorCode, 1)

            // Check error rate
            errorRate = calculateErrorRate(endpoint, timeWindow)
            IF errorRate > getErrorRateThreshold() THEN
                triggerPerformanceAlert("high_error_rate", endpoint, errorRate)
            END IF
        END IF

        // Update data transfer metrics
        IF eventData.dataSize IS NOT NULL THEN
            incrementMetric("data_transferred", endpoint, eventData.dataSize)
        END IF

        // Store metrics snapshot for historical analysis
        IF shouldCreateSnapshot(currentTime) THEN
            createMetricsSnapshot(currentTime)
        END IF
    END

    POSTCONDITION: Real-time metrics updated and alerts triggered if needed
END FUNCTION

// TEST: updateRealTimeMetrics calculates accurate rolling averages
// TEST: updateRealTimeMetrics triggers alerts at correct thresholds
// TEST: updateRealTimeMetrics handles high-frequency updates efficiently
```

### 6. Analytics Aggregation Algorithm

```pseudocode
FUNCTION aggregateAnalyticsData(timeRange, granularity)
    // TEST: Should produce accurate aggregated statistics
    // TEST: Should handle different time granularities
    // TEST: Should optimize query performance for large datasets

    PRECONDITION: timeRange contains valid start and end timestamps
    PRECONDITION: granularity is "hour", "day", "week", or "month"

    BEGIN
        aggregationResults = {}

        // Define time buckets based on granularity
        timeBuckets = createTimeBuckets(timeRange.start, timeRange.end, granularity)

        FOR each bucket in timeBuckets
            bucketStart = bucket.start
            bucketEnd = bucket.end

            // Aggregate request metrics
            requestMetrics = aggregateRequestMetrics(bucketStart, bucketEnd)

            // Aggregate performance metrics
            performanceMetrics = aggregatePerformanceMetrics(bucketStart, bucketEnd)

            // Aggregate cache metrics
            cacheMetrics = aggregateCacheMetrics(bucketStart, bucketEnd)

            // Aggregate error metrics
            errorMetrics = aggregateErrorMetrics(bucketStart, bucketEnd)

            // Aggregate endpoint popularity
            endpointMetrics = aggregateEndpointMetrics(bucketStart, bucketEnd)

            // Combine all metrics for this time bucket
            aggregationResults[bucket.key] = {
                timeRange: {start: bucketStart, end: bucketEnd},
                requests: requestMetrics,
                performance: performanceMetrics,
                cache: cacheMetrics,
                errors: errorMetrics,
                endpoints: endpointMetrics,
                summary: calculateSummaryMetrics(
                    requestMetrics,
                    performanceMetrics,
                    cacheMetrics,
                    errorMetrics
                )
            }
        END FOR

        // Calculate trends and comparisons
        trendsAnalysis = calculateTrends(aggregationResults, granularity)

        RETURN {
            aggregatedData: aggregationResults,
            trends: trendsAnalysis,
            metadata: {
                timeRange: timeRange,
                granularity: granularity,
                generatedAt: getCurrentTimestamp(),
                totalBuckets: timeBuckets.length
            }
        }
    END

    POSTCONDITION: Complete aggregated analytics data returned
END FUNCTION

// TEST: aggregateAnalyticsData handles different granularities correctly
// TEST: aggregateAnalyticsData calculates accurate trend analysis
// TEST: aggregateAnalyticsData optimizes performance for large time ranges
```

## Rate Limiting and Throttling

### 7. Rate Limiting Algorithm

```pseudocode
FUNCTION isRateLimited(sessionId, endpoint)
    // TEST: Should enforce rate limits per session and endpoint
    // TEST: Should use sliding window algorithm for accuracy
    // TEST: Should handle burst traffic appropriately

    PRECONDITION: sessionId is valid session identifier
    PRECONDITION: endpoint is valid endpoint string

    BEGIN
        currentTime = getCurrentTimestamp()
        windowSize = getRateLimitWindow()  // e.g., 60 seconds

        // Get rate limit configuration for endpoint
        rateLimitConfig = getRateLimitConfig(endpoint)
        maxRequests = rateLimitConfig.maxRequests
        windowDuration = rateLimitConfig.windowDuration

        // Create rate limit key
        rateLimitKey = createRateLimitKey(sessionId, endpoint)

        // Get request history for sliding window
        requestHistory = getRequestHistory(rateLimitKey, currentTime - windowDuration)

        // Clean up old requests outside window
        activeRequests = filterRequestsInWindow(requestHistory, currentTime, windowDuration)

        // Check if rate limit exceeded
        IF activeRequests.length >= maxRequests THEN
            // Update rate limit statistics
            recordRateLimitViolation(sessionId, endpoint, currentTime)
            RETURN true
        END IF

        // Record current request
        recordRequest(rateLimitKey, currentTime)

        // Clean up old request records periodically
        IF shouldCleanupRateLimitData(currentTime) THEN
            cleanupOldRateLimitData(currentTime - (windowDuration * 2))
        END IF

        RETURN false
    END

    POSTCONDITION: Rate limit status determined and request recorded
END FUNCTION

// TEST: isRateLimited enforces correct limits per time window
// TEST: isRateLimited uses sliding window for accurate rate limiting
// TEST: isRateLimited cleans up old data to prevent memory leaks
```

### 8. Adaptive Rate Limiting Algorithm

```pseudocode
FUNCTION adjustRateLimits(performanceMetrics)
    // TEST: Should adjust limits based on system performance
    // TEST: Should prevent system overload during high traffic
    // TEST: Should restore normal limits when performance improves

    PRECONDITION: performanceMetrics contains current system metrics

    BEGIN
        currentTime = getCurrentTimestamp()

        // Analyze system performance indicators
        avgResponseTime = performanceMetrics.avgResponseTime
        errorRate = performanceMetrics.errorRate
        cacheHitRate = performanceMetrics.cacheHitRate
        systemLoad = performanceMetrics.systemLoad

        // Calculate performance score (0-100, higher is better)
        performanceScore = calculatePerformanceScore(
            avgResponseTime,
            errorRate,
            cacheHitRate,
            systemLoad
        )

        // Determine rate limit adjustment factor
        adjustmentFactor = 1.0

        IF performanceScore < CRITICAL_PERFORMANCE_THRESHOLD THEN
            // Severe performance issues - reduce limits significantly
            adjustmentFactor = 0.5
            logRateLimitAdjustment("critical", performanceScore, adjustmentFactor)

        ELSE IF performanceScore < WARNING_PERFORMANCE_THRESHOLD THEN
            // Performance degradation - reduce limits moderately
            adjustmentFactor = 0.75
            logRateLimitAdjustment("warning", performanceScore, adjustmentFactor)

        ELSE IF performanceScore > EXCELLENT_PERFORMANCE_THRESHOLD THEN
            // Excellent performance - increase limits slightly
            adjustmentFactor = 1.25
            logRateLimitAdjustment("excellent", performanceScore, adjustmentFactor)
        END IF

        // Apply adjustments to all endpoint rate limits
        FOR each endpoint in getAllEndpoints()
            currentLimit = getCurrentRateLimit(endpoint)
            newLimit = Math.floor(currentLimit * adjustmentFactor)

            // Enforce minimum and maximum limits
            newLimit = clamp(newLimit, getMinRateLimit(endpoint), getMaxRateLimit(endpoint))

            IF newLimit != currentLimit THEN
                updateRateLimit(endpoint, newLimit, currentTime)
                logRateLimitChange(endpoint, currentLimit, newLimit, adjustmentFactor)
            END IF
        END FOR

        // Schedule next adjustment check
        scheduleNextAdjustment(currentTime + RATE_LIMIT_ADJUSTMENT_INTERVAL)
    END

    POSTCONDITION: Rate limits adjusted based on system performance
END FUNCTION

// TEST: adjustRateLimits reduces limits during performance degradation
// TEST: adjustRateLimits increases limits during excellent performance
// TEST: adjustRateLimits respects minimum and maximum limit boundaries
```

## Error Handling and Recovery

### 9. Circuit Breaker Algorithm

```pseudocode
FUNCTION checkCircuitBreaker(endpoint)
    // TEST: Should open circuit after consecutive failures
    // TEST: Should allow test requests in half-open state
    // TEST: Should close circuit after successful recovery

    PRECONDITION: endpoint is valid endpoint string

    BEGIN
        circuitState = getCircuitState(endpoint)
        currentTime = getCurrentTimestamp()

        SWITCH circuitState.status
            CASE "CLOSED":
                // Normal operation - check failure rate
                recentFailures = getRecentFailures(endpoint, FAILURE_WINDOW)
                failureRate = calculateFailureRate(recentFailures)

                IF failureRate >= FAILURE_THRESHOLD THEN
                    openCircuit(endpoint, currentTime)
                    logCircuitBreakerEvent(endpoint, "OPENED", failureRate)
                    RETURN "OPEN"
                END IF

                RETURN "CLOSED"

            CASE "OPEN":
                // Circuit is open - check if timeout period has passed
                IF currentTime - circuitState.openedAt >= CIRCUIT_TIMEOUT THEN
                    setCircuitState(endpoint, "HALF_OPEN", currentTime)
                    logCircuitBreakerEvent(endpoint, "HALF_OPEN", null)
                    RETURN "HALF_OPEN"
                END IF

                RETURN "OPEN"

            CASE "HALF_OPEN":
                // Allow limited test requests
                testRequestCount = getTestRequestCount(endpoint)
                IF testRequestCount >= MAX_TEST_REQUESTS THEN
                    RETURN "OPEN"  // Too many test requests, stay open
                END IF

                RETURN "HALF_OPEN"

            DEFAULT:
                // Unknown state - reset to closed
                setCircuitState(endpoint, "CLOSED", currentTime)
                RETURN "CLOSED"
        END SWITCH
    END

    POSTCONDITION: Circuit breaker state determined and updated
END FUNCTION

// TEST: checkCircuitBreaker opens circuit after failure threshold
// TEST: checkCircuitBreaker transitions to half-open after timeout
// TEST: checkCircuitBreaker limits test requests in half-open state
```

### 10. Fallback Response Algorithm

```pseudocode
FUNCTION generateFallbackResponse(endpoint, parameters, errorContext)
    // TEST: Should provide meaningful fallback data when possible
    // TEST: Should indicate fallback status in response
    // TEST: Should log fallback usage for monitoring

    PRECONDITION: endpoint is valid endpoint string
    PRECONDITION: parameters contains request parameters
    PRECONDITION: errorContext contains error information

    BEGIN
        fallbackStrategy = determineFallbackStrategy(endpoint, errorContext)

        SWITCH fallbackStrategy
            CASE "STALE_CACHE":
                // Try to serve stale cached data
                staleData = getStaleCache(generateCacheKey(endpoint, parameters))
                IF staleData IS NOT NULL THEN
                    logFallbackUsage(endpoint, "stale_cache", staleData.age)
                    RETURN createFallbackResponse(staleData.data, "stale_cache", staleData.age)
                END IF
                // Fall through to next strategy

            CASE "DEFAULT_DATA":
                // Provide default/sample data for the endpoint
                defaultData = getDefaultDataForEndpoint(endpoint)
                IF defaultData IS NOT NULL THEN
                    logFallbackUsage(endpoint, "default_data", null)
                    RETURN createFallbackResponse(defaultData, "default_data", null)
                END IF
                // Fall through to next strategy

            CASE "CACHED_SIMILAR":
                // Try to find similar cached data
                similarData = findSimilarCachedData(endpoint, parameters)
                IF similarData IS NOT NULL THEN
                    logFallbackUsage(endpoint, "similar_cache", similarData.similarity)
                    RETURN createFallbackResponse(similarData.data, "similar_cache", similarData.similarity)
                END IF
                // Fall through to next strategy

            CASE "ERROR_RESPONSE":
                // Return structured error response
                logFallbackUsage(endpoint, "error_response", null)
                RETURN createErrorResponse(
                    503,
                    "Service temporarily unavailable",
                    getCurrentRequestId(),
                    errorContext
                )

            DEFAULT:
                // Unknown strategy - return generic error
                logFallbackUsage(endpoint, "generic_error", null)
                RETURN createErrorResponse(
                    500,
                    "Internal server error",
                    getCurrentRequestId(),
                    errorContext
                )
        END SWITCH
    END

    POSTCONDITION: Fallback response generated and logged
END FUNCTION

// TEST: generateFallbackResponse tries stale cache first
// TEST: generateFallbackResponse provides default data when available
// TEST: generateFallbackResponse logs fallback strategy usage
```

## Module Configuration

```pseudocode
CONSTANTS:
    MAX_RETRIES = 3
    REQUEST_TIMEOUT = 30000  // 30 seconds
    RATE_LIMIT_WINDOW = 60000  // 1 minute
    FAILURE_THRESHOLD = 0.5  // 50% failure rate
    FAILURE_WINDOW = 300000  // 5 minutes
    CIRCUIT_TIMEOUT = 60000  // 1 minute
    MAX_TEST_REQUESTS = 5
    CRITICAL_PERFORMANCE_THRESHOLD = 30
    WARNING_PERFORMANCE_THRESHOLD = 50
    EXCELLENT_PERFORMANCE_THRESHOLD = 80
    RATE_LIMIT_ADJUSTMENT_INTERVAL = 300000  // 5 minutes
    SENSITIVE_PARAM_KEYS = ["key", "api_key", "token", "secret", "password"]
    EXCLUDED_CACHE_KEYS = ["key", "api_key", "token", "secret"]

CONFIGURATION:
    dataGolfBaseURL: from environment variable
    defaultRateLimit: from configuration file
    rateLimitByEndpoint: from configuration file
    performanceThresholds: from configuration file
    fallbackStrategies: from configuration file
    monitoringEnabled: from configuration file
