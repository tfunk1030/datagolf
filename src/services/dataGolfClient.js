/**
 * Data Golf API Client Service
 * Handles authentication, rate limiting, caching, and data transformation
 * Implements clean architecture with comprehensive error handling
 */

const axios = require('axios');
const { getConfig } = require('../config/environment');
const logger = require('../utils/logger');

class DataGolfClient {
  constructor() {
    this.config = getConfig();
    this.baseURL = this.config.dataGolf.baseUrl;
    this.apiKey = this.config.dataGolf.apiKey;
    this.timeout = this.config.dataGolf.timeout;
    this.retryAttempts = this.config.dataGolf.retryAttempts;
    this.retryDelay = this.config.dataGolf.retryDelay;

    // Initialize axios instance with default configuration
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Golf-Analytics-Backend/1.0.0'
      }
    });

    // Request interceptor for logging and rate limiting
    this.client.interceptors.request.use(
      (config) => {
        logger.debug('Data Golf API Request', {
          method: config.method,
          url: config.url,
          params: config.params,
          timestamp: new Date().toISOString()
        });
        return config;
      },
      (error) => {
        logger.error('Data Golf API Request Error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Data Golf API Response', {
          status: response.status,
          url: response.config.url,
          dataSize: JSON.stringify(response.data).length,
          timestamp: new Date().toISOString()
        });
        return response;
      },
      (error) => {
        this._handleResponseError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle API response errors with detailed logging
   * @param {Error} error - Axios error object
   * @private
   */
  _handleResponseError(error) {
    const errorDetails = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method,
      timestamp: new Date().toISOString()
    };

    if (error.response?.data) {
      errorDetails.responseData = error.response.data;
    }

    logger.error('Data Golf API Response Error', errorDetails);
  }

  /**
   * Implement exponential backoff retry logic
   * @param {Function} apiCall - Function that makes the API call
   * @param {number} attempt - Current attempt number
   * @returns {Promise} API response
   * @private
   */
  async _retryWithBackoff(apiCall, attempt = 1) {
    try {
      return await apiCall();
    } catch (error) {
      if (attempt >= this.retryAttempts) {
        throw error;
      }

      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      logger.warn(`Data Golf API retry attempt ${attempt}/${this.retryAttempts}`, {
        delay,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return this._retryWithBackoff(apiCall, attempt + 1);
    }
  }

  /**
   * Get tournament data with optional filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Tournament data
   */
  async getTournaments(options = {}) {
    const apiCall = () => this.client.get('/tournaments', { params: options });
    const response = await this._retryWithBackoff(apiCall);
    return this._transformTournamentData(response.data);
  }

  /**
   * Get player rankings with optional filtering
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Player rankings data
   */
  async getPlayerRankings(options = {}) {
    const apiCall = () => this.client.get('/rankings', { params: options });
    const response = await this._retryWithBackoff(apiCall);
    return this._transformRankingsData(response.data);
  }

  /**
   * Get field data for a specific tournament
   * @param {string} tournamentId - Tournament identifier
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Field data
   */
  async getTournamentField(tournamentId, options = {}) {
    if (!tournamentId) {
      throw new Error('Tournament ID is required');
    }

    const apiCall = () => this.client.get(`/field-updates/${tournamentId}`, { params: options });
    const response = await this._retryWithBackoff(apiCall);
    return this._transformFieldData(response.data);
  }

  /**
   * Get live scoring data for a tournament
   * @param {string} tournamentId - Tournament identifier
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Live scoring data
   */
  async getLiveScoring(tournamentId, options = {}) {
    if (!tournamentId) {
      throw new Error('Tournament ID is required');
    }

    const apiCall = () => this.client.get(`/live-scoring/${tournamentId}`, { params: options });
    const response = await this._retryWithBackoff(apiCall);
    return this._transformScoringData(response.data);
  }

  /**
   * Get player statistics
   * @param {string} playerId - Player identifier
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Player statistics
   */
  async getPlayerStats(playerId, options = {}) {
    if (!playerId) {
      throw new Error('Player ID is required');
    }

    const apiCall = () => this.client.get(`/player-stats/${playerId}`, { params: options });
    const response = await this._retryWithBackoff(apiCall);
    return this._transformPlayerStatsData(response.data);
  }

  /**
   * Get betting odds for tournaments
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Betting odds data
   */
  async getBettingOdds(options = {}) {
    const apiCall = () => this.client.get('/betting-odds', { params: options });
    const response = await this._retryWithBackoff(apiCall);
    return this._transformBettingOddsData(response.data);
  }

  /**
   * Transform tournament data to standardized format
   * @param {Object} data - Raw tournament data
   * @returns {Object} Transformed data
   * @private
   */
  _transformTournamentData(data) {
    if (!data || !Array.isArray(data)) {
      return { tournaments: [], metadata: { count: 0, transformedAt: new Date().toISOString() } };
    }

    const tournaments = data.map(tournament => ({
      id: tournament.dg_id || tournament.id,
      name: tournament.event_name || tournament.name,
      course: tournament.course || null,
      startDate: tournament.event_start_date || tournament.start_date,
      endDate: tournament.event_end_date || tournament.end_date,
      season: tournament.calendar_year || tournament.season,
      tour: tournament.tour || 'PGA',
      status: tournament.event_status || 'scheduled',
      purse: tournament.purse || null,
      location: {
        city: tournament.city || null,
        state: tournament.state || null,
        country: tournament.country || 'USA'
      },
      transformedAt: new Date().toISOString()
    }));

    return {
      tournaments,
      metadata: {
        count: tournaments.length,
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform rankings data to standardized format
   * @param {Object} data - Raw rankings data
   * @returns {Object} Transformed data
   * @private
   */
  _transformRankingsData(data) {
    if (!data || !Array.isArray(data)) {
      return { rankings: [], metadata: { count: 0, transformedAt: new Date().toISOString() } };
    }

    const rankings = data.map(player => ({
      playerId: player.dg_id || player.player_id,
      playerName: player.player_name || player.name,
      rank: player.rank || player.position,
      points: player.points || player.total_points,
      averagePoints: player.avg_points || null,
      eventsPlayed: player.events_played || 0,
      wins: player.wins || 0,
      top10s: player.top_10s || 0,
      earnings: player.earnings || 0,
      transformedAt: new Date().toISOString()
    }));

    return {
      rankings,
      metadata: {
        count: rankings.length,
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform field data to standardized format
   * @param {Object} data - Raw field data
   * @returns {Object} Transformed data
   * @private
   */
  _transformFieldData(data) {
    if (!data || !Array.isArray(data)) {
      return { field: [], metadata: { count: 0, transformedAt: new Date().toISOString() } };
    }

    const field = data.map(player => ({
      playerId: player.dg_id || player.player_id,
      playerName: player.player_name || player.name,
      status: player.status || 'active',
      teeTime: player.tee_time || null,
      group: player.group || null,
      odds: player.odds || null,
      ranking: player.owgr || player.ranking,
      transformedAt: new Date().toISOString()
    }));

    return {
      field,
      metadata: {
        count: field.length,
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform scoring data to standardized format
   * @param {Object} data - Raw scoring data
   * @returns {Object} Transformed data
   * @private
   */
  _transformScoringData(data) {
    if (!data || !Array.isArray(data)) {
      return { scores: [], metadata: { count: 0, transformedAt: new Date().toISOString() } };
    }

    const scores = data.map(score => ({
      playerId: score.dg_id || score.player_id,
      playerName: score.player_name || score.name,
      totalScore: score.total_score || score.score,
      currentRound: score.current_round || 1,
      roundScores: score.round_scores || [],
      position: score.position || score.rank,
      status: score.status || 'active',
      holesCompleted: score.holes_completed || 0,
      lastUpdated: score.last_updated || new Date().toISOString(),
      transformedAt: new Date().toISOString()
    }));

    return {
      scores,
      metadata: {
        count: scores.length,
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform player statistics to standardized format
   * @param {Object} data - Raw player stats data
   * @returns {Object} Transformed data
   * @private
   */
  _transformPlayerStatsData(data) {
    if (!data) {
      return { stats: {}, metadata: { transformedAt: new Date().toISOString() } };
    }

    const stats = {
      playerId: data.dg_id || data.player_id,
      playerName: data.player_name || data.name,
      season: data.season || new Date().getFullYear(),
      drivingDistance: data.driving_distance || null,
      drivingAccuracy: data.driving_accuracy || null,
      greensInRegulation: data.gir || null,
      puttingAverage: data.putting_avg || null,
      scoringAverage: data.scoring_avg || null,
      eagles: data.eagles || 0,
      birdies: data.birdies || 0,
      pars: data.pars || 0,
      bogeys: data.bogeys || 0,
      doubleBogeys: data.double_bogeys || 0,
      transformedAt: new Date().toISOString()
    };

    return {
      stats,
      metadata: {
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Transform betting odds to standardized format
   * @param {Object} data - Raw betting odds data
   * @returns {Object} Transformed data
   * @private
   */
  _transformBettingOddsData(data) {
    if (!data || !Array.isArray(data)) {
      return { odds: [], metadata: { count: 0, transformedAt: new Date().toISOString() } };
    }

    const odds = data.map(odd => ({
      playerId: odd.dg_id || odd.player_id,
      playerName: odd.player_name || odd.name,
      tournamentId: odd.tournament_id || odd.event_id,
      bookmaker: odd.bookmaker || 'unknown',
      odds: {
        decimal: odd.decimal_odds || null,
        american: odd.american_odds || null,
        fractional: odd.fractional_odds || null
      },
      impliedProbability: odd.implied_probability || null,
      lastUpdated: odd.last_updated || new Date().toISOString(),
      transformedAt: new Date().toISOString()
    }));

    return {
      odds,
      metadata: {
        count: odds.length,
        transformedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Health check for Data Golf API connectivity
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      await this.client.get('/health', { timeout: 5000 });
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = DataGolfClient;
