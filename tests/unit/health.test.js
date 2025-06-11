/**
 * @fileoverview Unit tests for health check routes
 * @module tests/unit/health
 */

const request = require('supertest');
const { createApp } = require('../../src/app');

const app = createApp();

describe('Health Check Routes', () => {
  describe('GET /health', () => {
    it('should return basic health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health information', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('performance');
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
      expect(typeof response.body.checks).toBe('object');
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('pid');
      expect(response.body).toHaveProperty('uptime');
    });
  });

  describe('GET /health/metrics', () => {
    it('should return performance metrics', async () => {
      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('process');
      expect(response.body).toHaveProperty('system');
      expect(response.body.process).toHaveProperty('uptime_seconds');
      expect(response.body.process).toHaveProperty('memory_usage_bytes');
      expect(response.body.process).toHaveProperty('cpu_usage_microseconds');
    });
  });

  describe('GET /health/version', () => {
    it('should return version information', async () => {
      const response = await request(app)
        .get('/health/version')
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Golf API Analytics Backend');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('nodeVersion');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
