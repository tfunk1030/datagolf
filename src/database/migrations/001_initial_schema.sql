-- Initial Database Schema for Golf API Analytics Backend
-- Creates core tables for caching, analytics, user preferences, and API management

-- Cache entries table for multi-level caching system
CREATE TABLE cache_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL UNIQUE,
    cache_level INTEGER NOT NULL DEFAULT 1, -- 1=L1, 2=L2, 3=L3
    data_type TEXT NOT NULL, -- 'json', 'text', 'binary'
    content TEXT, -- JSON or text content
    content_compressed BLOB, -- Compressed binary content for L3
    content_hash TEXT NOT NULL, -- SHA-256 hash for integrity
    size_bytes INTEGER NOT NULL DEFAULT 0,
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for cache performance
CREATE INDEX idx_cache_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_level ON cache_entries(cache_level);
CREATE INDEX idx_cache_expires ON cache_entries(expires_at);
CREATE INDEX idx_cache_accessed ON cache_entries(last_accessed);
CREATE INDEX idx_cache_hash ON cache_entries(content_hash);

-- Analytics events table for tracking API usage and performance
CREATE TABLE analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL, -- 'api_request', 'cache_hit', 'cache_miss', 'error'
    session_id TEXT,
    user_agent TEXT,
    ip_address TEXT,
    endpoint TEXT,
    method TEXT,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    cache_status TEXT, -- 'hit', 'miss', 'bypass'
    error_message TEXT,
    metadata TEXT, -- JSON for additional event data
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for analytics queries
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_session ON analytics_events(session_id);
CREATE INDEX idx_analytics_endpoint ON analytics_events(endpoint);
CREATE INDEX idx_analytics_timestamp ON analytics_events(timestamp);
CREATE INDEX idx_analytics_status ON analytics_events(status_code);

-- User preferences table for session-based preferences
CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    preference_key TEXT NOT NULL,
    preference_value TEXT NOT NULL, -- JSON value
    preference_type TEXT NOT NULL DEFAULT 'string', -- 'string', 'number', 'boolean', 'object'
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, preference_key)
);

-- Indexes for preferences
CREATE INDEX idx_preferences_session ON user_preferences(session_id);
CREATE INDEX idx_preferences_key ON user_preferences(preference_key);

-- API endpoints registry for tracking and management
CREATE TABLE api_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_path TEXT NOT NULL UNIQUE,
    method TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    rate_limit_per_minute INTEGER DEFAULT 60,
    cache_ttl_seconds INTEGER DEFAULT 300,
    requires_auth BOOLEAN DEFAULT FALSE,
    response_schema TEXT, -- JSON schema for validation
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for endpoint lookups
CREATE INDEX idx_endpoints_path ON api_endpoints(endpoint_path);
CREATE INDEX idx_endpoints_active ON api_endpoints(is_active);

-- API rate limiting table for tracking request counts
CREATE TABLE rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL, -- IP address or session ID
    endpoint_path TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start DATETIME NOT NULL,
    window_end DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(identifier, endpoint_path, window_start)
);

-- Indexes for rate limiting
CREATE INDEX idx_rate_limits_identifier ON rate_limits(identifier);
CREATE INDEX idx_rate_limits_endpoint ON rate_limits(endpoint_path);
CREATE INDEX idx_rate_limits_window ON rate_limits(window_start, window_end);

-- System configuration table for runtime settings
CREATE TABLE system_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT NOT NULL UNIQUE,
    config_value TEXT NOT NULL, -- JSON value
    config_type TEXT NOT NULL DEFAULT 'string',
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for config lookups
CREATE INDEX idx_config_key ON system_config(config_key);

-- Session analytics table for tracking session behavior
CREATE TABLE session_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    request_count INTEGER DEFAULT 0,
    total_response_time_ms INTEGER DEFAULT 0,
    cache_hit_count INTEGER DEFAULT 0,
    cache_miss_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    user_agent TEXT,
    ip_address TEXT,
    referrer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id)
);

-- Indexes for session analytics
CREATE INDEX idx_session_analytics_id ON session_analytics(session_id);
CREATE INDEX idx_session_analytics_first_seen ON session_analytics(first_seen);
CREATE INDEX idx_session_analytics_last_seen ON session_analytics(last_seen);

-- Performance metrics table for system monitoring
CREATE TABLE performance_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric_name TEXT NOT NULL,
    metric_value REAL NOT NULL,
    metric_unit TEXT, -- 'ms', 'bytes', 'count', 'percent'
    tags TEXT, -- JSON object for metric tags
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance metrics
CREATE INDEX idx_metrics_name ON performance_metrics(metric_name);
CREATE INDEX idx_metrics_timestamp ON performance_metrics(timestamp);

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_cache_entries_timestamp
    AFTER UPDATE ON cache_entries
    BEGIN
        UPDATE cache_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_user_preferences_timestamp
    AFTER UPDATE ON user_preferences
    BEGIN
        UPDATE user_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_api_endpoints_timestamp
    AFTER UPDATE ON api_endpoints
    BEGIN
        UPDATE api_endpoints SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_system_config_timestamp
    AFTER UPDATE ON system_config
    BEGIN
        UPDATE system_config SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_session_analytics_timestamp
    AFTER UPDATE ON session_analytics
    BEGIN
        UPDATE session_analytics SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Insert default system configuration
INSERT INTO system_config (config_key, config_value, config_type, description) VALUES
('cache_default_ttl', '300', 'number', 'Default cache TTL in seconds'),
('cache_max_size_mb', '100', 'number', 'Maximum cache size in megabytes'),
('analytics_retention_days', '30', 'number', 'Number of days to retain analytics data'),
('rate_limit_window_minutes', '1', 'number', 'Rate limiting window in minutes'),
('session_timeout_minutes', '30', 'number', 'Session timeout in minutes'),
('compression_threshold_bytes', '1024', 'number', 'Minimum size for compression'),
('max_request_size_mb', '10', 'number', 'Maximum request size in megabytes');

-- Insert default API endpoints
INSERT INTO api_endpoints (endpoint_path, method, description, rate_limit_per_minute, cache_ttl_seconds) VALUES
('/health', 'GET', 'Health check endpoint', 120, 60),
('/health/detailed', 'GET', 'Detailed health check', 60, 30),
('/health/ready', 'GET', 'Readiness probe', 120, 10),
('/health/live', 'GET', 'Liveness probe', 120, 10),
('/health/metrics', 'GET', 'System metrics', 30, 60),
('/health/version', 'GET', 'Version information', 60, 300);
