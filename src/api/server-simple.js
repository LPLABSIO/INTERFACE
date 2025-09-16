const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');

// Import routes
const deviceRoutes = require('./routes/devices');
const sessionRoutes = require('./routes/sessions');
const queueRoutes = require('./routes/queue');
const metricsRoutes = require('./routes/metrics');
const healthRoutes = require('./routes/health');

// Import orchestrator
const AppOrchestrator = require('../core/AppOrchestrator');

/**
 * Version simplifiée de l'API Server
 */
class SimpleAPIServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.app = express();
    this.server = null;
    this.io = null;
    this.orchestrator = null;
    this.clients = new Map();
  }

  /**
   * Initialiser le serveur
   */
  async initialize() {
    // Créer l'orchestrator
    this.orchestrator = new AppOrchestrator({
      maxConcurrentTasks: 5,
      healthCheckInterval: 30000
    });
    await this.orchestrator.initialize();

    // Configuration middleware
    this.setupMiddleware();

    // Routes API
    this.setupRoutes();

    // WebSocket (simplifié)
    this.setupWebSocket();

    // Gestion des erreurs
    this.setupErrorHandling();

    // Démarrer le serveur
    return this.startServer();
  }

  /**
   * Configuration des middleware
   */
  setupMiddleware() {
    // Sécurité
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000 // limite à 1000 requêtes par IP
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true }));

    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Configuration des routes
   */
  setupRoutes() {
    // Routes API
    this.app.use('/api/devices', deviceRoutes(this.orchestrator));
    this.app.use('/api/sessions', sessionRoutes(this.orchestrator));
    this.app.use('/api/queue', queueRoutes(this.orchestrator));
    this.app.use('/api/metrics', metricsRoutes(this.orchestrator));
    this.app.use('/api/health', healthRoutes(this.orchestrator));

    // Documentation API
    this.app.get('/api', (req, res) => {
      res.json({
        title: 'iOS Automation Platform API',
        version: '1.0.0',
        status: 'running',
        endpoints: {
          devices: 'GET /api/devices - Liste des appareils',
          sessions: 'GET /api/sessions - Gestion des sessions',
          queue: 'GET /api/queue - File d\'attente des tâches',
          metrics: 'GET /api/metrics - Métriques système',
          health: 'GET /api/health/status - État de santé'
        },
        websocket: 'ws://localhost:' + this.port
      });
    });
  }

  /**
   * Configuration WebSocket (simplifié)
   */
  setupWebSocket() {
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);
      this.clients.set(socket.id, socket);

      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        this.clients.delete(socket.id);
      });

      // Envoyer le statut initial
      socket.emit('status', {
        timestamp: new Date().toISOString(),
        status: 'connected',
        message: 'Connected to iOS Automation Platform'
      });
    });

    console.log('[WebSocket] Server configured');
  }

  /**
   * Diffuser un message à tous les clients connectés
   */
  broadcast(event, data) {
    this.clients.forEach(socket => {
      socket.emit(event, data);
    });
  }

  /**
   * Gestion des erreurs
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res, next) => {
      res.status(404).json({
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString()
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('[API Error]', err);

      const status = err.status || 500;
      const message = err.message || 'Internal Server Error';

      res.status(status).json({
        error: status === 500 ? 'Internal Server Error' : err.name,
        message: status === 500 ? 'An unexpected error occurred' : message,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Démarrer le serveur HTTP
   */
  async startServer() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 API Server running on http://localhost:${this.port}`);
        console.log(`📡 WebSocket available on ws://localhost:${this.port}`);
        console.log(`📖 API docs: http://localhost:${this.port}/api`);
        resolve();
      });
    });
  }

  /**
   * Arrêter le serveur
   */
  async stop() {
    console.log('[API Server] Shutting down...');

    // Fermer les connexions WebSocket
    this.clients.forEach(socket => socket.disconnect());
    if (this.io) {
      this.io.close();
    }

    // Arrêter l'orchestrator
    if (this.orchestrator && this.orchestrator.shutdown) {
      await this.orchestrator.shutdown();
    }

    // Fermer le serveur HTTP
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[API Server] Shutdown complete');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Export et lancement si exécuté directement
if (require.main === module) {
  const server = new SimpleAPIServer({
    port: process.env.PORT || 3000
  });

  server.initialize().catch(console.error);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

module.exports = SimpleAPIServer;