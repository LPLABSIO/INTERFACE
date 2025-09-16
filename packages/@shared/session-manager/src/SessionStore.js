const sqlite3 = require('sqlite3').verbose();
const path = require('path');

/**
 * Store pour la persistance des sessions avec SQLite
 */
class SessionStore {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(process.cwd(), 'sessions.db');
    this.db = null;
  }

  /**
   * Initialiser la base de données
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Créer les tables si elles n'existent pas
        this.createTables()
          .then(resolve)
          .catch(reject);
      });
    });
  }

  /**
   * Créer les tables nécessaires
   */
  async createTables() {
    const sessionTableSQL = `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        state TEXT NOT NULL,
        config TEXT,
        retries INTEGER DEFAULT 0,
        start_time TEXT,
        end_time TEXT,
        error TEXT,
        metadata TEXT,
        results TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const sessionEventsSQL = `
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data TEXT,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `;

    const metricsTableSQL = `
      CREATE TABLE IF NOT EXISTS session_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        session_id TEXT,
        metric_type TEXT NOT NULL,
        value REAL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(sessionTableSQL, (err) => {
          if (err) {
            reject(err);
            return;
          }

          this.db.run(sessionEventsSQL, (err) => {
            if (err) {
              reject(err);
              return;
            }

            this.db.run(metricsTableSQL, (err) => {
              if (err) {
                reject(err);
                return;
              }

              // Créer les index pour les performances
              this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id)');
              this.db.run('CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state)');
              this.db.run('CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id)');
              this.db.run('CREATE INDEX IF NOT EXISTS idx_metrics_device_id ON session_metrics(device_id)');

              resolve();
            });
          });
        });
      });
    });
  }

  /**
   * Sauvegarder une session
   */
  async saveSession(session) {
    const sql = `
      INSERT OR REPLACE INTO sessions (
        id, device_id, state, config, retries,
        start_time, end_time, error, metadata, results, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [
        session.id,
        session.deviceId,
        session.state,
        JSON.stringify(session.config || {}),
        session.retries || 0,
        session.startTime,
        session.endTime,
        JSON.stringify(session.error),
        JSON.stringify(session.metadata || {}),
        JSON.stringify(session.results || {}),
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Récupérer une session par ID
   */
  async getSession(sessionId) {
    const sql = 'SELECT * FROM sessions WHERE id = ?';

    return new Promise((resolve, reject) => {
      this.db.get(sql, [sessionId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? this.rowToSession(row) : null);
        }
      });
    });
  }

  /**
   * Récupérer toutes les sessions actives
   */
  async getActiveSessions() {
    const sql = `
      SELECT * FROM sessions
      WHERE state IN ('running', 'paused', 'starting')
      ORDER BY updated_at DESC
    `;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => this.rowToSession(row)));
        }
      });
    });
  }

  /**
   * Récupérer les sessions d'un appareil
   */
  async getDeviceSessions(deviceId, limit = 100) {
    const sql = `
      SELECT * FROM sessions
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [deviceId, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => this.rowToSession(row)));
        }
      });
    });
  }

  /**
   * Enregistrer un événement de session
   */
  async recordEvent(sessionId, eventType, data) {
    const sql = `
      INSERT INTO session_events (session_id, event_type, data)
      VALUES (?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [sessionId, eventType, JSON.stringify(data)], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Récupérer les événements d'une session
   */
  async getSessionEvents(sessionId) {
    const sql = `
      SELECT * FROM session_events
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [sessionId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => ({
            ...row,
            data: JSON.parse(row.data || '{}')
          })));
        }
      });
    });
  }

  /**
   * Enregistrer une métrique
   */
  async recordMetric(deviceId, sessionId, metricType, value) {
    const sql = `
      INSERT INTO session_metrics (device_id, session_id, metric_type, value)
      VALUES (?, ?, ?, ?)
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [deviceId, sessionId, metricType, value], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Récupérer les métriques d'un appareil
   */
  async getDeviceMetrics(deviceId, since = null) {
    let sql = `
      SELECT * FROM session_metrics
      WHERE device_id = ?
    `;

    const params = [deviceId];

    if (since) {
      sql += ' AND timestamp >= ?';
      params.push(since);
    }

    sql += ' ORDER BY timestamp DESC';

    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Obtenir les statistiques globales
   */
  async getStats() {
    const sql = `
      SELECT
        COUNT(*) as total_sessions,
        SUM(CASE WHEN state = 'completed' THEN 1 ELSE 0 END) as completed_sessions,
        SUM(CASE WHEN state = 'error' OR state = 'terminated' THEN 1 ELSE 0 END) as failed_sessions,
        SUM(CASE WHEN state IN ('running', 'starting', 'paused') THEN 1 ELSE 0 END) as active_sessions,
        AVG(CASE
          WHEN state = 'completed' AND start_time IS NOT NULL AND end_time IS NOT NULL
          THEN (julianday(end_time) - julianday(start_time)) * 24 * 60 * 60
          ELSE NULL
        END) as avg_duration_seconds
      FROM sessions
    `;

    return new Promise((resolve, reject) => {
      this.db.get(sql, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Nettoyer les anciennes sessions
   */
  async cleanup(daysToKeep = 30) {
    const sql = `
      DELETE FROM sessions
      WHERE created_at < datetime('now', '-${daysToKeep} days')
      AND state IN ('completed', 'terminated', 'error')
    `;

    return new Promise((resolve, reject) => {
      this.db.run(sql, [], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * Convertir une ligne de base de données en objet session
   */
  rowToSession(row) {
    return {
      id: row.id,
      deviceId: row.device_id,
      state: row.state,
      config: JSON.parse(row.config || '{}'),
      retries: row.retries,
      startTime: row.start_time,
      endTime: row.end_time,
      error: JSON.parse(row.error || 'null'),
      metadata: JSON.parse(row.metadata || '{}'),
      results: JSON.parse(row.results || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Fermer la connexion à la base de données
   */
  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

module.exports = SessionStore;