const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const SessionStore = require('./SessionStore');
const SessionMetrics = require('./SessionMetrics');

/**
 * États possibles d'une session
 */
const SessionState = {
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  PAUSED: 'paused',
  ERROR: 'error',
  COMPLETED: 'completed',
  TERMINATED: 'terminated'
};

/**
 * Gestionnaire de sessions pour l'automatisation multi-appareils
 */
class SessionManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.sessions = new Map(); // Sessions actives en mémoire
    this.store = new SessionStore(options.dbPath || './sessions.db');
    this.metrics = new SessionMetrics();
    this.maxRetries = options.maxRetries || 3;
    this.sessionTimeout = options.sessionTimeout || 300000; // 5 minutes par défaut

    // Initialiser le store
    this.initialize();
  }

  async initialize() {
    try {
      await this.store.initialize();
      await this.restoreSessions();
      console.log('[SessionManager] Initialized successfully');
    } catch (error) {
      console.error('[SessionManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle session
   */
  async createSession(deviceId, config = {}) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      deviceId,
      state: SessionState.IDLE,
      config,
      retries: 0,
      startTime: null,
      endTime: null,
      error: null,
      metadata: {
        app: config.app || 'unknown',
        proxyProvider: config.proxyProvider || 'none',
        accountsTarget: config.accountsNumber || 1,
        accountsCreated: 0
      }
    };

    // Sauvegarder en mémoire et en base
    this.sessions.set(sessionId, session);
    await this.store.saveSession(session);

    this.emit('session:created', session);
    console.log(`[SessionManager] Created session ${sessionId} for device ${deviceId}`);

    return session;
  }

  /**
   * Démarrer une session
   */
  async startSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.state !== SessionState.IDLE && session.state !== SessionState.ERROR) {
      throw new Error(`Cannot start session in state ${session.state}`);
    }

    // Mettre à jour l'état
    session.state = SessionState.STARTING;
    session.startTime = new Date().toISOString();

    // Démarrer le timeout
    session.timeoutId = setTimeout(() => {
      this.handleSessionTimeout(sessionId);
    }, this.sessionTimeout);

    await this.updateSession(sessionId, session);
    this.emit('session:starting', session);

    // Marquer comme running après l'initialisation
    setTimeout(() => {
      this.updateSessionState(sessionId, SessionState.RUNNING);
    }, 1000);

    return session;
  }

  /**
   * Mettre en pause une session
   */
  async pauseSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.state !== SessionState.RUNNING) {
      throw new Error(`Cannot pause session in state ${session.state}`);
    }

    // Clear timeout
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    session.state = SessionState.PAUSED;
    session.pausedAt = new Date().toISOString();

    await this.updateSession(sessionId, session);
    this.emit('session:paused', session);

    return session;
  }

  /**
   * Reprendre une session en pause
   */
  async resumeSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.state !== SessionState.PAUSED) {
      throw new Error(`Cannot resume session in state ${session.state}`);
    }

    // Redémarrer le timeout
    const pauseDuration = Date.now() - new Date(session.pausedAt).getTime();
    const remainingTime = this.sessionTimeout - pauseDuration;

    session.timeoutId = setTimeout(() => {
      this.handleSessionTimeout(sessionId);
    }, remainingTime > 0 ? remainingTime : 0);

    session.state = SessionState.RUNNING;
    delete session.pausedAt;

    await this.updateSession(sessionId, session);
    this.emit('session:resumed', session);

    return session;
  }

  /**
   * Terminer une session avec succès
   */
  async completeSession(sessionId, results = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Clear timeout
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    session.state = SessionState.COMPLETED;
    session.endTime = new Date().toISOString();
    session.results = results;

    // Calculer les métriques
    const duration = new Date(session.endTime) - new Date(session.startTime);
    this.metrics.recordSessionCompleted(session.deviceId, duration, results);

    await this.updateSession(sessionId, session);
    this.emit('session:completed', session);

    // Nettoyer après un délai
    setTimeout(() => {
      this.cleanupSession(sessionId);
    }, 60000); // 1 minute

    return session;
  }

  /**
   * Gérer une erreur de session
   */
  async handleSessionError(sessionId, error) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Clear timeout
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    session.error = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    // Retry logic
    if (session.retries < this.maxRetries) {
      session.retries++;
      session.state = SessionState.ERROR;

      console.log(`[SessionManager] Session ${sessionId} error (retry ${session.retries}/${this.maxRetries}):`, error.message);

      await this.updateSession(sessionId, session);
      this.emit('session:error', session);

      // Tenter de redémarrer après un délai
      setTimeout(() => {
        this.startSession(sessionId);
      }, 5000 * session.retries); // Backoff exponentiel

    } else {
      // Max retries atteint
      session.state = SessionState.TERMINATED;
      session.endTime = new Date().toISOString();

      console.error(`[SessionManager] Session ${sessionId} terminated after ${this.maxRetries} retries`);

      await this.updateSession(sessionId, session);
      this.emit('session:terminated', session);

      this.metrics.recordSessionFailed(session.deviceId, error);

      // Nettoyer
      setTimeout(() => {
        this.cleanupSession(sessionId);
      }, 60000);
    }
  }

  /**
   * Gérer le timeout d'une session
   */
  handleSessionTimeout(sessionId) {
    console.log(`[SessionManager] Session ${sessionId} timed out`);
    this.handleSessionError(sessionId, new Error('Session timeout'));
  }

  /**
   * Mettre à jour une session
   */
  async updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    Object.assign(session, updates);
    await this.store.saveSession(session);
    this.emit('session:updated', session);
  }

  /**
   * Mettre à jour l'état d'une session
   */
  async updateSessionState(sessionId, state) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const oldState = session.state;
    session.state = state;

    await this.updateSession(sessionId, session);
    this.emit('session:state-changed', { sessionId, oldState, newState: state });
  }

  /**
   * Nettoyer une session terminée
   */
  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.timeoutId) {
      clearTimeout(session.timeoutId);
    }

    this.sessions.delete(sessionId);
    console.log(`[SessionManager] Cleaned up session ${sessionId}`);
  }

  /**
   * Restaurer les sessions depuis la base de données
   */
  async restoreSessions() {
    const sessions = await this.store.getActiveSessions();

    for (const session of sessions) {
      // Ne restaurer que les sessions qui étaient en cours
      if (session.state === SessionState.RUNNING || session.state === SessionState.PAUSED) {
        session.state = SessionState.PAUSED; // Les mettre en pause pour révision
        this.sessions.set(session.id, session);
        this.emit('session:restored', session);

        console.log(`[SessionManager] Restored session ${session.id} for device ${session.deviceId}`);
      }
    }
  }

  /**
   * Obtenir une session par ID
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Obtenir toutes les sessions actives
   */
  getActiveSessions() {
    return Array.from(this.sessions.values());
  }

  /**
   * Obtenir les sessions d'un appareil
   */
  getDeviceSessions(deviceId) {
    return Array.from(this.sessions.values()).filter(s => s.deviceId === deviceId);
  }

  /**
   * Obtenir les métriques
   */
  getMetrics() {
    return this.metrics.getMetrics();
  }

  /**
   * Arrêter proprement le manager
   */
  async shutdown() {
    console.log('[SessionManager] Shutting down...');

    // Sauvegarder toutes les sessions actives
    for (const session of this.sessions.values()) {
      if (session.state === SessionState.RUNNING) {
        await this.pauseSession(session.id);
      }

      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
      }
    }

    await this.store.close();
    this.removeAllListeners();

    console.log('[SessionManager] Shutdown complete');
  }
}

module.exports = { SessionManager, SessionState };