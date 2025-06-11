# Golf API Analytics Backend Service - Domain Model

## Core Entities and Relationships

### Entity Relationship Overview
```
User Session (1) -----> (N) API Requests
User Session (1) -----> (N) User Preferences
API Request (1) -----> (1) Cache Entry
API Request (1) -----> (N) Analytics Events
Cache Entry (1) -----> (N) Cache Hits
User Preferences (1) -----> (N) Query Templates
```

## Entity Definitions

### 1. UserSession
**Purpose**: Track user interactions without requiring authentication
**Lifecycle**: Created on first request, expires after inactivity

```typescript
interface UserSession {
  sessionId: string           // UUID v4 identifier
  ipAddress: string          // Client IP for tracking
  userAgent: string          // Browser/client identification
  createdAt: timestamp       // Session creation time
  lastAccessedAt: timestamp  // Last activity timestamp
  expiresAt: timestamp       // Session expiration time
  isActive: boolean          // Session status flag
  metadata: object           // Additional session data
}
```

**Business Rules**:
- Session expires after 24 hours of inactivity
- Maximum 1000 active sessions per IP address
- Session data automatically cleaned up after expiration

### 2. ApiRequest
**Purpose**: Log all API requests for analytics and monitoring
**Lifecycle**: Created for each request, retained for 90 days

```typescript
interface ApiRequest {
  requestId: string          // UUID v4 identifier
  sessionId: string          // Foreign key to UserSession
  endpoint: string           // Data Golf API endpoint
  method: string             // HTTP method (GET, POST, etc.)
  parameters: object         // Request parameters (excluding API key)
  requestUrl: string         // Full request URL (sanitized)
  timestamp: timestamp       // Request timestamp
  responseStatus: number     // HTTP response status code
  responseTime: number       // Response time in milliseconds
  cacheHit: boolean         // Whether response came from cache
  errorMessage: string       // Error details if request failed
  dataSize: number          // Response payload size in bytes
  transformations: array    // Applied data transformations
}
```

**Business Rules**:
- API keys must be excluded from logged parameters
- Failed requests must include error details
- Response time includes cache lookup time
- Data size calculated after transformations

### 3. CacheEntry
**Purpose**: Store cached API responses with metadata
**Lifecycle**: Created on cache miss, expires based on TTL

```typescript
interface CacheEntry {
  cacheKey: string          // Unique cache identifier (hash of endpoint + params)
  endpoint: string          // Data Golf API endpoint
  parameters: object        // Normalized request parameters
  responseData: blob        // Compressed response payload
  contentType: string       // Response content type
  createdAt: timestamp      // Cache creation time
  expiresAt: timestamp      // Cache expiration time
  lastAccessedAt: timestamp // Last cache hit timestamp
  hitCount: number          // Number of cache hits
  dataSize: number          // Original response size
  compressedSize: number    // Compressed storage size
  isValid: boolean          // Cache validity flag
  version: string           // Cache schema version
}
```

**Business Rules**:
- Cache key generated from normalized endpoint + parameters
- TTL varies by endpoint type (5min-24hrs)
- LRU eviction when storage limit reached
- Automatic compression for responses > 1KB

### 4. UserPreferences
**Purpose**: Store user configuration and preferences
**Lifecycle**: Created on first preference save, updated as needed

```typescript
interface UserPreferences {
  preferenceId: string      // UUID v4 identifier
  sessionId: string         // Foreign key to UserSession
  preferenceType: string    // Type: 'api_key', 'default_params', 'ui_settings'
  preferenceKey: string     // Specific preference identifier
  preferenceValue: string   // Encrypted preference value
  isEncrypted: boolean      // Whether value is encrypted
  createdAt: timestamp      // Preference creation time
  updatedAt: timestamp      // Last update timestamp
  expiresAt: timestamp      // Optional expiration time
  isActive: boolean         // Preference status flag
}
```

**Business Rules**:
- API keys must be encrypted using AES-256
- Preferences expire with session unless explicitly persisted
- Maximum 100 preferences per session
- Sensitive data automatically encrypted

### 5. QueryTemplate
**Purpose**: Store reusable query configurations
**Lifecycle**: Created by user, persists until deleted

```typescript
interface QueryTemplate {
  templateId: string        // UUID v4 identifier
  sessionId: string         // Foreign key to UserSession
  templateName: string      // User-defined template name
  description: string       // Template description
  endpoint: string          // Target API endpoint
  parameters: object        // Default parameter values
  transformations: array    // Data transformation rules
  isPublic: boolean         // Whether template can be shared
  createdAt: timestamp      // Template creation time
  updatedAt: timestamp      // Last modification time
  usageCount: number        // Number of times used
  isActive: boolean         // Template status flag
}
```

**Business Rules**:
- Template names must be unique per session
- Public templates visible to all users
- Parameters validated against endpoint schema
- Maximum 50 templates per session

### 6. AnalyticsEvent
**Purpose**: Track detailed analytics and usage patterns
**Lifecycle**: Created for significant events, aggregated daily

```typescript
interface AnalyticsEvent {
  eventId: string           // UUID v4 identifier
  sessionId: string         // Foreign key to UserSession
  eventType: string         // Event category: 'request', 'cache', 'error', 'performance'
  eventName: string         // Specific event name
  eventData: object         // Event-specific data
  timestamp: timestamp      // Event timestamp
  endpoint: string          // Related API endpoint (if applicable)
  duration: number          // Event duration in milliseconds
  metadata: object          // Additional event context
}
```

**Business Rules**:
- Events aggregated into daily summaries
- Raw events retained for 30 days
- Performance events trigger alerts if thresholds exceeded
- Event data sanitized to remove sensitive information

### 7. SystemHealth
**Purpose**: Monitor system performance and health metrics
**Lifecycle**: Updated continuously, historical data retained

```typescript
interface SystemHealth {
  healthId: string          // UUID v4 identifier
  timestamp: timestamp      // Measurement timestamp
  metricType: string        // Metric category: 'performance', 'storage', 'api'
  metricName: string        // Specific metric name
  metricValue: number       // Measured value
  unit: string              // Measurement unit
  threshold: number         // Alert threshold value
  status: string            // Status: 'healthy', 'warning', 'critical'
  details: object           // Additional metric context
}
```

**Business Rules**:
- Health checks run every 30 seconds
- Alerts triggered when thresholds exceeded
- Historical data aggregated hourly after 24 hours
- Critical status triggers immediate notifications

## Data Relationships and Constraints

### Primary Relationships
1. **UserSession → ApiRequest**: One-to-many relationship tracking all requests per session
2. **ApiRequest → CacheEntry**: One-to-one relationship linking requests to cache entries
3. **UserSession → UserPreferences**: One-to-many relationship for user configuration
4. **UserSession → QueryTemplate**: One-to-many relationship for saved templates
5. **ApiRequest → AnalyticsEvent**: One-to-many relationship for detailed event tracking

### Referential Integrity
- All foreign keys must reference valid parent records
- Cascade delete for session-dependent data
- Soft delete for audit trail preservation
- Orphaned record cleanup via scheduled jobs

### Data Validation Rules

#### Session Management
- Session ID must be valid UUID v4 format
- IP address must be valid IPv4 or IPv6
- User agent string limited to 500 characters
- Session timeout between 1 hour and 7 days

#### API Request Validation
- Endpoint must match known Data Golf API patterns
- Parameters must be valid JSON object
- Response time must be positive number
- Status code must be valid HTTP status

#### Cache Management
- Cache key must be unique and deterministic
- Expiration time must be future timestamp
- Hit count must be non-negative integer
- Data size must match actual payload size

#### Preference Security
- Encrypted preferences use AES-256-GCM
- Preference keys follow naming conventions
- Sensitive data automatically flagged for encryption
- Preference values limited to 10KB

## Domain Events and State Transitions

### Session Lifecycle Events
1. **SessionCreated**: New user session established
2. **SessionAccessed**: User activity updates last access time
3. **SessionExpired**: Session timeout reached
4. **SessionTerminated**: Explicit session cleanup

### Cache Lifecycle Events
1. **CacheMiss**: Request not found in cache, fetch from API
2. **CacheHit**: Request served from cache
3. **CacheExpired**: Cache entry reached TTL
4. **CacheEvicted**: Cache entry removed due to storage limits

### Request Processing Events
1. **RequestReceived**: New API request initiated
2. **RequestValidated**: Request parameters validated
3. **RequestProcessed**: Request completed successfully
4. **RequestFailed**: Request processing failed

### Analytics Events
1. **MetricCalculated**: Performance metric computed
2. **ThresholdExceeded**: Performance threshold breached
3. **ReportGenerated**: Analytics report created
4. **AlertTriggered**: System alert activated

## Data Storage Considerations

### SQLite Schema Design
- Normalized tables with appropriate indexes
- Foreign key constraints enabled
- JSON columns for flexible object storage
- Partial indexes for performance optimization

### Performance Optimization
- Composite indexes on frequently queried columns
- Partitioning strategy for time-series data
- Query optimization for analytics aggregations
- Connection pooling for concurrent access

### Data Retention Policies
- **Raw Requests**: 90 days retention
- **Cache Entries**: TTL-based expiration
- **Analytics Events**: 30 days raw, 1 year aggregated
- **User Preferences**: Session-based or explicit expiration
- **System Health**: 7 days detailed, 90 days aggregated

### Backup and Recovery
- Daily automated backups
- Point-in-time recovery capability
- Backup verification and testing
- Disaster recovery procedures

## Security and Privacy

### Data Protection
- API keys encrypted at rest using AES-256
- Personal data minimization principles
- Secure key management practices
- Regular security audits

### Access Control
- Session-based access control
- IP-based rate limiting
- Request validation and sanitization
- Audit logging for security events

### Compliance Considerations
- GDPR-compliant data handling
- Data retention policy enforcement
- User consent management
- Right to deletion implementation
