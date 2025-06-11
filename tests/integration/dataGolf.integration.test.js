/**
 * Data Golf API Integration Tests
 * Tests end-to-end functionality of the complete Data Golf integration system
 * Validates routes, services, caching, error handling, and external API interactions
 */

const request = require('supertest');
const nock = require('nock');
const { createApp } = require('../../src/app');
const { getConfig } = require('../../src/config/environment');

describe('Data Golf API Integration Tests', () => {
  let app;
  let config;

  beforeAll(() => {
    config = getConfig();
    app = createApp();
  });

  beforeEach(() => {
    // Clean up any pending nock interceptors
    nock.cleanAll();
  });

  afterEach(() => {
    // Ensure all nock interceptors were used
    if (!nock.isDone()) {
      console.warn('Unused nock interceptors:', nock.pendingMocks());
      nock.cleanAll();
    }
  });

  describe('Health Check Integration', () => {
    it('should return system health including Data Golf service status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
    });
  });

  describe('Tournament Endpoints Integration', () => {
    it('should fetch and cache tournament data successfully', async () => {
      // Mock Data Golf API response
      const mockTournaments = {
        tournaments: [
          {
            event_id: 'test-tournament-1',
            event_name: 'Test Tournament',
            calendar_year: 2024,
            date: '2024-01-15',
            course: 'Test Course',
            purse: 8000000,
            field_size: 156
          }
        ]
      };

      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(200, mockTournaments);

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('tournaments');
      expect(response.body.data.tournaments).toHaveLength(1);
      expect(response.body.data.tournaments[0]).toMatchObject({
        eventId: 'test-tournament-1',
        eventName: 'Test Tournament',
        year: 2024
      });

      // Verify caching headers
      expect(response.headers).toHaveProperty('x-cache-status');
    });

    it('should handle Data Golf API errors gracefully', async () => {
      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Data Golf API error');
    });

    it('should validate query parameters correctly', async () => {
      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .query({ year: 'invalid-year' })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('validation');
    });
  });

  describe('Rankings Endpoints Integration', () => {
    it('should fetch world rankings with proper data transformation', async () => {
      const mockRankings = {
        rankings: [
          {
            player_name: 'Test Player',
            country: 'USA',
            owgr: 1,
            datagolf_rank: 1,
            skill_estimate: 2.5,
            am: false
          }
        ]
      };

      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(200, mockRankings);

      const response = await request(app)
        .get('/api/data-golf/rankings/world')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.rankings[0]).toMatchObject({
        playerName: 'Test Player',
        country: 'USA',
        owgr: 1,
        dataGolfRank: 1,
        skillEstimate: 2.5,
        amateur: false
      });
    });
  });

  describe('Field Data Integration', () => {
    it('should fetch tournament field with player details', async () => {
      const mockField = {
        field: [
          {
            player_name: 'Test Player',
            dg_id: 12345,
            country: 'USA',
            amateur: false,
            event_name: 'Test Tournament'
          }
        ]
      };

      nock('https://feeds.datagolf.com')
        .get('/field-updates')
        .query({
          key: config.dataGolf.apiKey,
          event_id: 'test-tournament'
        })
        .reply(200, mockField);

      const response = await request(app)
        .get('/api/data-golf/field/test-tournament')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.field[0]).toMatchObject({
        playerName: 'Test Player',
        dgId: 12345,
        country: 'USA',
        amateur: false,
        eventName: 'Test Tournament'
      });
    });
  });

  describe('Live Scoring Integration', () => {
    it('should fetch live scores with proper formatting', async () => {
      const mockScores = {
        leaderboard: [
          {
            player_name: 'Test Player',
            country: 'USA',
            rounds: [70, 68],
            total_score: -6,
            position: 'T1',
            prize_money: 50000
          }
        ]
      };

      nock('https://feeds.datagolf.com')
        .get('/preds/live-tournament-stats')
        .query({
          key: config.dataGolf.apiKey,
          event_id: 'test-tournament'
        })
        .reply(200, mockScores);

      const response = await request(app)
        .get('/api/data-golf/live/test-tournament')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.leaderboard[0]).toMatchObject({
        playerName: 'Test Player',
        country: 'USA',
        rounds: [70, 68],
        totalScore: -6,
        position: 'T1',
        prizeMoney: 50000
      });
    });
  });

  describe('Player Statistics Integration', () => {
    it('should fetch player stats with comprehensive data', async () => {
      const mockStats = {
        stats: [
          {
            player_name: 'Test Player',
            dg_id: 12345,
            sg_putt: 0.5,
            sg_arg: 0.3,
            sg_app: 0.2,
            sg_ott: 0.4,
            sg_total: 1.4,
            distance: 295.5,
            accuracy: 65.2,
            gir: 72.1,
            scrambling: 58.3
          }
        ]
      };

      nock('https://feeds.datagolf.com')
        .get('/preds/skill-decompositions')
        .query({
          key: config.dataGolf.apiKey,
          player_id: '12345'
        })
        .reply(200, mockStats);

      const response = await request(app)
        .get('/api/data-golf/stats/12345')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.stats[0]).toMatchObject({
        playerName: 'Test Player',
        dgId: 12345,
        strokesGained: {
          putting: 0.5,
          aroundGreen: 0.3,
          approach: 0.2,
          offTee: 0.4,
          total: 1.4
        },
        driving: {
          distance: 295.5,
          accuracy: 65.2
        },
        shortGame: {
          gir: 72.1,
          scrambling: 58.3
        }
      });
    });
  });

  describe('Betting Odds Integration', () => {
    it('should fetch betting odds with market data', async () => {
      const mockOdds = {
        odds: [
          {
            player_name: 'Test Player',
            dg_id: 12345,
            win_odds: 1200,
            top_5_odds: 300,
            top_10_odds: 150,
            make_cut_odds: -200,
            implied_prob_win: 0.083,
            implied_prob_top5: 0.25,
            implied_prob_top10: 0.40,
            implied_prob_cut: 0.67
          }
        ]
      };

      nock('https://feeds.datagolf.com')
        .get('/betting-tools/outrights')
        .query({
          key: config.dataGolf.apiKey,
          event_id: 'test-tournament'
        })
        .reply(200, mockOdds);

      const response = await request(app)
        .get('/api/data-golf/odds/test-tournament')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data.odds[0]).toMatchObject({
        playerName: 'Test Player',
        dgId: 12345,
        odds: {
          win: 1200,
          top5: 300,
          top10: 150,
          makeCut: -200
        },
        impliedProbabilities: {
          win: 0.083,
          top5: 0.25,
          top10: 0.40,
          makeCut: 0.67
        }
      });
    });
  });

  describe('Caching System Integration', () => {
    it('should serve cached data on subsequent requests', async () => {
      const mockData = { tournaments: [{ event_id: 'cached-test' }] };

      // First request - should hit API
      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(200, mockData);

      const firstResponse = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(200);

      expect(firstResponse.headers['x-cache-status']).toBe('MISS');

      // Second request - should hit cache
      const secondResponse = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(200);

      expect(secondResponse.headers['x-cache-status']).toBe('HIT');
      expect(secondResponse.body).toEqual(firstResponse.body);
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should respect rate limits and implement backoff', async () => {
      // Mock rate limit response
      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(429, { error: 'Rate limit exceeded' });

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(429);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('Rate limit');
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit breaker after consecutive failures', async () => {
      // Mock multiple failures
      for (let i = 0; i < 5; i++) {
        nock('https://feeds.datagolf.com')
          .get('/preds/get-dg-id')
          .query({ key: config.dataGolf.apiKey })
          .reply(500, { error: 'Server Error' });
      }

      // Make multiple requests to trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get('/api/data-golf/tournaments')
          .expect(500);
      }

      // Next request should be rejected by circuit breaker
      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(503);

      expect(response.body.error).toContain('Circuit breaker');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle network timeouts gracefully', async () => {
      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .delayConnection(10000) // Simulate timeout
        .reply(200, {});

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('timeout');
    });

    it('should handle malformed API responses', async () => {
      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(200, 'invalid json response');

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('parsing');
    });
  });

  describe('Security Integration', () => {
    it('should include security headers in responses', async () => {
      const mockData = { tournaments: [] };

      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(200, mockData);

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(200);

      // Check for security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should sanitize error messages to prevent information leakage', async () => {
      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(500, {
          error: 'Database connection failed: user=admin password=secret123'
        });

      const response = await request(app)
        .get('/api/data-golf/tournaments')
        .expect(500);

      // Error message should not contain sensitive information
      expect(response.body.error).not.toContain('password');
      expect(response.body.error).not.toContain('secret123');
    });
  });

  describe('Performance Integration', () => {
    it('should complete requests within acceptable time limits', async () => {
      const mockData = { tournaments: [] };

      nock('https://feeds.datagolf.com')
        .get('/preds/get-dg-id')
        .query({ key: config.dataGolf.apiKey })
        .reply(200, mockData);

      const startTime = Date.now();

      await request(app)
        .get('/api/data-golf/tournaments')
        .expect(200);

      const responseTime = Date.now() - startTime;

      // Should complete within 5 seconds
      expect(responseTime).toBeLessThan(5000);
    });
  });
});
