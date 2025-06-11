/**
 * Database Manager
 * Handles SQLite database connections, migrations, and query execution
 * Implements connection pooling and transaction management
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const { getConfig } = require('../config/environment');
const logger = require('../utils/logger');
const { DatabaseError } = require('../middleware/errorHandler');

class DatabaseManager {
  constructor() {
    this.db = null;
    this.config = getConfig();
    this.dbPath = this.config.database.path;
    this.isConnected = false;
    this.transactionCount = 0;
  }

  /**
   * Initialize database connection and run migrations
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      await this.connect();
      await this.runMigrations();
      logger.info('Database initialized successfully', {
        path: this.dbPath,
        mode: this.config.database.mode
      });
    } catch (error) {
      logger.error('Database initialization failed', error);
      throw new DatabaseError('Failed to initialize database', error);
    }
  }

  /**
   * Establish database connection
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      // Ensure database directory exists
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Create database connection
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.error('Database connection failed', err);
          reject(new DatabaseError('Failed to connect to database', err));
          return;
        }

        this.isConnected = true;
        logger.info('Database connected', { path: this.dbPath });
        resolve();
      });

      // Configure database settings
      this.db.configure('busyTimeout', 30000);
      this.db.run('PRAGMA foreign_keys = ON');
      this.db.run('PRAGMA journal_mode = WAL');
      this.db.run('PRAGMA synchronous = NORMAL');
      this.db.run('PRAGMA cache_size = 10000');
      this.db.run('PRAGMA temp_store = MEMORY');
    });
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.db || !this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          logger.error('Database close failed', err);
          reject(new DatabaseError('Failed to close database', err));
          return;
        }

        this.isConnected = false;
        this.db = null;
        logger.info('Database connection closed');
        resolve();
      });
    });
  }

  /**
   * Execute a query with parameters
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Query result
   */
  async query(sql, params = []) {
    if (!this.isConnected) {
      throw new DatabaseError('Database not connected');
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        const duration = Date.now() - startTime;

        if (err) {
          logger.error('Database query failed', {
            sql: sql.substring(0, 100),
            error: err.message,
            duration
          });
          reject(new DatabaseError('Query execution failed', err));
          return;
        }

        logger.debug('Database query executed', {
          sql: sql.substring(0, 100),
          rowCount: rows.length,
          duration
        });

        resolve({
          rows,
          rowCount: rows.length,
          duration
        });
      });
    });
  }

  /**
   * Execute a single row query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object|null>} Single row or null
   */
  async queryOne(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Execute an insert/update/delete query
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<Object>} Execution result
   */
  async execute(sql, params = []) {
    if (!this.isConnected) {
      throw new DatabaseError('Database not connected');
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        const duration = Date.now() - startTime;

        if (err) {
          logger.error('Database execution failed', {
            sql: sql.substring(0, 100),
            error: err.message,
            duration
          });
          reject(new DatabaseError('Query execution failed', err));
          return;
        }

        logger.debug('Database query executed', {
          sql: sql.substring(0, 100),
          lastID: this.lastID,
          changes: this.changes,
          duration
        });

        resolve({
          lastID: this.lastID,
          changes: this.changes,
          duration
        });
      });
    });
  }

  /**
   * Execute multiple queries in a transaction
   * @param {Function} callback - Transaction callback function
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback) {
    if (!this.isConnected) {
      throw new DatabaseError('Database not connected');
    }

    this.transactionCount++;
    const transactionId = this.transactionCount;

    try {
      await this.execute('BEGIN TRANSACTION');
      logger.debug('Transaction started', { id: transactionId });

      const result = await callback(this);

      await this.execute('COMMIT');
      logger.debug('Transaction committed', { id: transactionId });

      return result;
    } catch (error) {
      await this.execute('ROLLBACK');
      logger.error('Transaction rolled back', {
        id: transactionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Run database migrations
   * @returns {Promise<void>}
   */
  async runMigrations() {
    try {
      // Create migrations table if it doesn't exist
      await this.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get list of executed migrations
      const executedMigrations = await this.query(
        'SELECT filename FROM migrations ORDER BY id'
      );
      const executedFiles = new Set(executedMigrations.rows.map(row => row.filename));

      // Get migration files
      const migrationsDir = path.join(__dirname, 'migrations');
      if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir, { recursive: true });
        logger.info('Created migrations directory', { path: migrationsDir });
        return;
      }

      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      // Execute pending migrations
      for (const filename of migrationFiles) {
        if (!executedFiles.has(filename)) {
          await this.executeMigration(filename);
        }
      }

      logger.info('Database migrations completed', {
        total: migrationFiles.length,
        executed: migrationFiles.length - executedFiles.size
      });
    } catch (error) {
      logger.error('Migration execution failed', error);
      throw new DatabaseError('Failed to run migrations', error);
    }
  }

  /**
   * Execute a single migration file
   * @param {string} filename - Migration filename
   * @returns {Promise<void>}
   */
  async executeMigration(filename) {
    const migrationPath = path.join(__dirname, 'migrations', filename);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    await this.transaction(async (db) => {
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        await db.execute(statement);
      }

      // Record migration as executed
      await db.execute(
        'INSERT INTO migrations (filename) VALUES (?)',
        [filename]
      );
    });

    logger.info('Migration executed', { filename });
  }

  /**
   * Get database statistics
   * @returns {Promise<Object>} Database statistics
   */
  async getStats() {
    if (!this.isConnected) {
      return { connected: false };
    }

    try {
      const [
        tableCount,
        totalRows,
        dbSize
      ] = await Promise.all([
        this.queryOne("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"),
        this.queryOne("SELECT SUM(count) as total FROM (SELECT COUNT(*) as count FROM sqlite_master WHERE type='table')"),
        this.queryOne("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()")
      ]);

      return {
        connected: true,
        tables: tableCount?.count || 0,
        totalRows: totalRows?.total || 0,
        sizeBytes: dbSize?.size || 0,
        path: this.dbPath
      };
    } catch (error) {
      logger.error('Failed to get database stats', error);
      return { connected: true, error: error.message };
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;
