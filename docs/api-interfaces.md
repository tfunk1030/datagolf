# Golf API Analytics Backend Service - API Interface Definitions

## API Overview

The Golf API Analytics Backend Service exposes a RESTful API that serves as an intelligent proxy between the React frontend and the Data Golf API. All endpoints follow REST conventions with consistent request/response patterns, comprehensive error handling, and detailed metadata.

## Base Configuration

```typescript
// API Base Configuration
const API_CONFIG = {
  baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
  version: 'v1',
  timeout: 30000,
  retries: 3,
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: 100  // per session
  }
}

// Standard Headers
const STANDARD_HEADERS = {
  'Content-Type': 'application/json',
  'X-API-Version': 'v1',
  'X-Request-ID': '<uuid>',
  'X-Session-ID': '<session-uuid>'
}
```

## Common Types and Interfaces

### Standard Response Wrapper

```typescript
interface APIResponse<T = any> {
  success: boolean
  data?: T
  error?: APIError
  metadata: ResponseMetadata
}

interface APIError {
  code: string
  message: string
  details?: Record<string, any>
  timestamp: number
  requestId: string
}

interface ResponseMetadata {
  requestId: string
  timestamp: number
  processingTime: number
  cached?: boolean
  cacheAge?: number
  cacheKey?: string
  dataSize?: number
  transformationsApplied?: string[]
  rateLimit?: {
    remaining: number
    resetTime: number
  }
}
```

### Session Management Types

```typescript
interface Session {
  sessionId: string
  ipAddress: string
  userAgent: string
  createdAt: number
  lastAccessedAt: number
  expiresAt: number
  isActive: boolean
  metadata?: Record<string, any>
}

interface CreateSessionRequest {
  userAgent?: string
  metadata?: Record<string, any>
}
```

### Preference Management Types

```typescript
interface UserPreference {
  preferenceId: string
  preferenceType: 'api_key' | 'default_params' | 'ui_settings' | 'custom'
  preferenceKey: string
  preferenceValue: any
  isEncrypted: boolean
  createdAt: number
  updatedAt: number
  expiresAt?: number
}

interface SetPreferenceRequest {
  preferenceType: string
  preferenceKey: string
  preferenceValue: any
  encrypt?: boolean
  expiresAt?: number
}
```

### Template Management Types

```typescript
interface QueryTemplate {
  templateId: string
  sessionId: string
  templateName: string
  description?: string
  endpoint: string
  parameters: Record<string, any>
  transformations?: TransformationRule[]
  isPublic: boolean
  createdAt: number
  updatedAt: number
  usageCount: number
  isActive: boolean
}

interface CreateTemplateRequest {
  templateName: string
  description?: string
  endpoint: string
  parameters: Record<string, any>
  transformations?: TransformationRule[]
  isPublic?: boolean
}

interface ExecuteTemplateRequest {
  parameterOverrides?: Record<string, any>
  transformationOverrides?: TransformationRule[]
  outputFormat?: 'json' | 'csv' | 'xml'
}
```

### Data Transformation Types

```typescript
interface TransformationRule {
  type: 'filter' | 'map' | 'aggregate' | 'sort' | 'format' | 'calculate'
  name: string
  config: Record<string, any>
  priority: number
  isCritical?: boolean
}

interface TransformationResult {
  data: any
  appliedTransformations: AppliedTransformation[]
  originalDataSize: number
  transformedDataSize: number
  processingTime: number
}

interface AppliedTransformation {
  type: string
  name: string
  success: boolean
  error?: string
  processingTime: number
}
```

## API Endpoints

### 1. Session Management

#### Create Session
```http
POST /api/v1/sessions
Content-Type: application/json

{
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "clientVersion": "1.0.0",
    "features": ["caching", "analytics"]
  }
}
```

**Response:**
```typescript
interface CreateSessionResponse extends APIResponse<Session> {
  data: Session
}
```

**Example Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "createdAt": 1703123456789,
    "lastAccessedAt": 1703123456789,
    "expiresAt": 1703209856789,
    "isActive": true,
    "metadata": {
      "clientVersion": "1.0.0",
      "features": ["caching", "analytics"]
    }
  },
  "metadata": {
    "requestId": "req_123456789",
    "timestamp": 1703123456789,
    "processingTime": 45
  }
}
```

#### Get Session
```http
GET /api/v1/sessions/{sessionId}
X-Session-ID: {sessionId}
```

#### Delete Session
```http
DELETE /api/v1/sessions/{sessionId}
X-Session-ID: {sessionId}
```

### 2. API Proxy Endpoints

#### Proxy GET Request
```http
GET /api/v1/proxy/{endpoint}?{parameters}
X-Session-ID: {sessionId}
X-Cache-Override: false
X-Output-Format: json
X-Transformations: base64-encoded-json
```

**Query Parameters:**
- All Data Golf API parameters are passed through
- Special parameters:
  - `_cache_override`: boolean - Force cache refresh
  - `_output_format`: string - Response format (json, csv, xml)
  - `_transformations`: string - Base64 encoded transformation rules

**Response:**
```typescript
interface ProxyResponse extends APIResponse {
  data: any // Transformed Data Golf API response
  metadata: ResponseMetadata & {
    originalEndpoint: string
    dataGolfStatus: number
    cacheHit: boolean
    transformationsApplied: string[]
  }
}
```

#### Proxy POST Request
```http
POST /api/v1/proxy/{endpoint}
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "parameters": {
    "key1": "value1",
    "key2": "value2"
  },
  "transformations": [
    {
      "type": "filter",
      "name": "filterByDate",
      "config": {
        "field": "date",
        "operator": "gte",
        "value": "2023-01-01"
      },
      "priority": 1
    }
  ],
  "outputFormat": "json",
  "cacheOverride": false
}
```

### 3. User Preferences

#### Get All Preferences
```http
GET /api/v1/preferences
X-Session-ID: {sessionId}
```

**Query Parameters:**
- `types`: comma-separated list of preference types to retrieve
- `include_encrypted`: boolean - Include encrypted preferences (default: true)

**Response:**
```typescript
interface GetPreferencesResponse extends APIResponse {
  data: {
    [preferenceType: string]: {
      [preferenceKey: string]: {
        value: any
        createdAt: number
        updatedAt: number
        isEncrypted: boolean
      }
    }
  }
}
```

#### Set Preference
```http
POST /api/v1/preferences
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "preferenceType": "api_key",
  "preferenceKey": "data_golf_key",
  "preferenceValue": "your-api-key-here",
  "encrypt": true,
  "expiresAt": 1703209856789
}
```

#### Update Preference
```http
PUT /api/v1/preferences/{type}/{key}
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "preferenceValue": "new-value",
  "encrypt": false
}
```

#### Delete Preference
```http
DELETE /api/v1/preferences/{type}/{key}
X-Session-ID: {sessionId}
```

### 4. Query Templates

#### Get Templates
```http
GET /api/v1/templates
X-Session-ID: {sessionId}
```

**Query Parameters:**
- `include_public`: boolean - Include public templates (default: true)
- `endpoint`: string - Filter by endpoint
- `search`: string - Search in template names and descriptions

**Response:**
```typescript
interface GetTemplatesResponse extends APIResponse {
  data: {
    owned: QueryTemplate[]
    public: QueryTemplate[]
    total: number
  }
}
```

#### Create Template
```http
POST /api/v1/templates
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "templateName": "Player Stats Last 30 Days",
  "description": "Get player statistics for the last 30 days with performance metrics",
  "endpoint": "player-stats",
  "parameters": {
    "player_id": null,
    "start_date": "{{today-30d}}",
    "end_date": "{{today}}",
    "include_metrics": true
  },
  "transformations": [
    {
      "type": "filter",
      "name": "activePlayersOnly",
      "config": {
        "field": "status",
        "operator": "eq",
        "value": "active"
      },
      "priority": 1
    },
    {
      "type": "sort",
      "name": "sortByRanking",
      "config": {
        "field": "world_ranking",
        "direction": "asc"
      },
      "priority": 2
    }
  ],
  "isPublic": false
}
```

#### Execute Template
```http
POST /api/v1/templates/{templateId}/execute
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "parameterOverrides": {
    "player_id": "12345",
    "include_metrics": false
  },
  "transformationOverrides": [
    {
      "type": "format",
      "name": "csvOutput",
      "config": {
        "format": "csv",
        "includeHeaders": true
      },
      "priority": 10
    }
  ],
  "outputFormat": "csv"
}
```

#### Update Template
```http
PUT /api/v1/templates/{templateId}
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "templateName": "Updated Template Name",
  "description": "Updated description",
  "parameters": {
    "updated_param": "value"
  }
}
```

#### Delete Template
```http
DELETE /api/v1/templates/{templateId}
X-Session-ID: {sessionId}
```

### 5. Analytics and Monitoring

#### Get Metrics
```http
GET /api/v1/analytics/metrics
X-Session-ID: {sessionId}
```

**Query Parameters:**
- `timeRange`: string - Time range (1h, 24h, 7d, 30d, custom)
- `startTime`: number - Unix timestamp (for custom range)
- `endTime`: number - Unix timestamp (for custom range)
- `granularity`: string - Data granularity (minute, hour, day)
- `metrics`: comma-separated list of specific metrics

**Response:**
```typescript
interface GetMetricsResponse extends APIResponse {
  data: {
    timeRange: {
      start: number
      end: number
      granularity: string
    }
    requests: {
      total: number
      successful: number
      failed: number
      cached: number
      byEndpoint: Record<string, number>
    }
    performance: {
      avgResponseTime: number
      p50ResponseTime: number
      p95ResponseTime: number
      p99ResponseTime: number
      cacheHitRate: number
      errorRate: number
    }
    cache: {
      totalEntries: number
      totalSize: number
      hitRate: number
      evictions: number
      compressionRatio: number
    }
    timeSeries: Array<{
      timestamp: number
      requests: number
      avgResponseTime: number
      cacheHitRate: number
      errorRate: number
    }>
  }
}
```

#### Get Reports
```http
GET /api/v1/analytics/reports
X-Session-ID: {sessionId}
```

**Query Parameters:**
- `reportType`: string - Report type (usage, performance, errors, trends)
- `timeRange`: string - Time range for the report
- `format`: string - Output format (json, csv, pdf)

#### Get Health Status
```http
GET /api/v1/analytics/health
```

**Response:**
```typescript
interface HealthStatusResponse extends APIResponse {
  data: {
    status: 'healthy' | 'warning' | 'critical'
    timestamp: number
    components: {
      database: ComponentHealth
      cache: ComponentHealth
      externalAPI: ComponentHealth
      memory: ComponentHealth
      cpu: ComponentHealth
    }
    metrics: {
      uptime: number
      requestsPerMinute: number
      avgResponseTime: number
      errorRate: number
      cacheHitRate: number
    }
    alerts: Alert[]
  }
}

interface ComponentHealth {
  status: 'healthy' | 'warning' | 'critical'
  responseTime?: number
  errorRate?: number
  lastCheck: number
  details?: Record<string, any>
}

interface Alert {
  id: string
  type: 'performance' | 'error' | 'capacity' | 'security'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  timestamp: number
  resolved: boolean
}
```

### 6. Cache Management

#### Get Cache Statistics
```http
GET /api/v1/cache/stats
X-Session-ID: {sessionId}
```

**Response:**
```typescript
interface CacheStatsResponse extends APIResponse {
  data: {
    totalEntries: number
    totalSize: number
    totalCompressedSize: number
    hitRate: number
    missRate: number
    evictionRate: number
    avgTTL: number
    compressionRatio: number
    topEndpoints: Array<{
      endpoint: string
      hitCount: number
      totalSize: number
      avgResponseTime: number
    }>
    recentActivity: Array<{
      timestamp: number
      operation: 'hit' | 'miss' | 'store' | 'evict'
      endpoint: string
      size?: number
    }>
  }
}
```

#### Invalidate Cache
```http
POST /api/v1/cache/invalidate
Content-Type: application/json
X-Session-ID: {sessionId}

{
  "pattern": "player-stats*",
  "reason": "Data update from external source"
}
```

#### Clear Cache
```http
DELETE /api/v1/cache/clear
X-Session-ID: {sessionId}
```

**Query Parameters:**
- `confirm`: boolean - Required confirmation parameter

## Error Handling

### Standard Error Codes

```typescript
enum APIErrorCode {
  // Client Errors (4xx)
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Server Errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',

  // Business Logic Errors
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  PREFERENCE_NOT_FOUND = 'PREFERENCE_NOT_FOUND',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  TRANSFORMATION_ERROR = 'TRANSFORMATION_ERROR',
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR'
}
```

### Error Response Format

```typescript
interface ErrorResponse extends APIResponse {
  success: false
  error: {
    code: APIErrorCode
    message: string
    details?: {
      field?: string
      value?: any
      constraint?: string
      suggestion?: string
    }
    timestamp: number
    requestId: string
    retryAfter?: number // For rate limiting
  }
  metadata: ResponseMetadata
}
```

### Example Error Responses

#### Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "field": "endpoint",
      "value": "invalid-endpoint",
      "constraint": "Must be a valid Data Golf API endpoint",
      "suggestion": "Use one of: player-stats, tournament-results, rankings"
    },
    "timestamp": 1703123456789,
    "requestId": "req_123456789"
  },
  "metadata": {
    "requestId": "req_123456789",
    "timestamp": 1703123456789,
    "processingTime": 12
  }
}
```

#### Rate Limit Error
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded for session",
    "details": {
      "limit": 100,
      "window": "60 seconds",
      "current": 101
    },
    "timestamp": 1703123456789,
    "requestId": "req_123456789",
    "retryAfter": 45
  },
  "metadata": {
    "requestId": "req_123456789",
    "timestamp": 1703123456789,
    "processingTime": 5,
    "rateLimit": {
      "remaining": 0,
      "resetTime": 1703123501789
    }
  }
}
```

## Request/Response Examples

### Complete Proxy Request Flow

#### Request
```http
GET /api/v1/proxy/player-stats?player_id=12345&start_date=2023-01-01&end_date=2023-12-31
X-Session-ID: 550e8400-e29b-41d4-a716-446655440000
X-Output-Format: json
X-Transformations: eyJ0eXBlIjoiZmlsdGVyIiwibmFtZSI6ImFjdGl2ZU9ubHkiLCJjb25maWciOnsic3RhdHVzIjoiYWN0aXZlIn19
```

#### Response
```json
{
  "success": true,
  "data": {
    "player": {
      "id": 12345,
      "name": "Tiger Woods",
      "stats": {
        "tournaments": 15,
        "wins": 3,
        "top10s": 8,
        "earnings": 5420000
      }
    }
  },
  "metadata": {
    "requestId": "req_987654321",
    "timestamp": 1703123456789,
    "processingTime": 156,
    "cached": true,
    "cacheAge": 3600000,
    "cacheKey": "player-stats:12345:2023-01-01:2023-12-31",
    "dataSize": 2048,
    "transformationsApplied": ["activeOnly"],
    "originalEndpoint": "player-stats",
    "dataGolfStatus": 200
  }
}
```

### Template Execution with Overrides

#### Request
```http
POST /api/v1/templates/template_123/execute
Content-Type: application/json
X-Session-ID: 550e8400-e29b-41d4-a716-446655440000

{
  "parameterOverrides": {
    "player_id": "67890",
    "include_detailed_stats": true
  },
  "outputFormat": "csv"
}
```

#### Response
```json
{
  "success": true,
  "data": "player_id,name,tournaments,wins,earnings\n67890,\"Rory McIlroy\",18,4,6750000\n",
  "metadata": {
    "requestId": "req_456789123",
    "timestamp": 1703123456789,
    "processingTime": 234,
    "cached": false,
    "dataSize": 1024,
    "transformationsApplied": ["activePlayersOnly", "sortByRanking", "csvFormat"],
    "templateMetadata": {
      "templateId": "template_123",
      "templateName": "Player Stats Last 30 Days",
      "executedAt": 1703123456789,
      "parameterOverrides": {
        "player_id": "67890",
        "include_detailed_stats": true
      }
    }
  }
}
```

## Authentication and Security

### Session-Based Authentication

All API endpoints (except session creation and health checks) require a valid session ID in the `X-Session-ID` header. Sessions are created without user accounts and are identified by browser/client characteristics.

### Rate Limiting

Rate limiting is applied per session and per endpoint:
- Default: 100 requests per minute per session
- Endpoint-specific limits may apply
- Rate limit headers included in all responses

### Input Validation

All request data is validated against JSON schemas:
- Parameter types and formats
- Required fields
- Value constraints
- SQL injection prevention
- XSS prevention

### Data Sanitization

Sensitive data is automatically sanitized:
- API keys excluded from logs
- PII removed from analytics
- User input escaped
- Response data filtered

This comprehensive API interface design provides a robust foundation for the Golf API Analytics Backend Service, ensuring type safety, comprehensive error handling, and excellent developer experience.
