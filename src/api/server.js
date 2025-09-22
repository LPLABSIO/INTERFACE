const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Import routes
const deviceRoutes = require('./routes/devices');
const sessionRoutes = require('./routes/sessions');
const queueRoutes = require('./routes/queue');
const metricsRoutes = require('./routes/metrics');
const healthRoutes = require('./routes/health');

// Import orchestrator
const AppOrchestrator = require('../core/AppOrchestrator');

/**
 * API Server pour la plateforme d'automatisation iOS
 */
class APIServer {
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

    // WebSocket
    this.setupWebSocket();

    // Error handling
    this.setupErrorHandling();

    // Start server
    await this.start();
  }

  /**
   * Configuration des middleware
   */
  setupMiddleware() {
    // Security
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: '*', // En production, configurer les origines autorisées
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      credentials: true
    }));

    // Body parsing
    this.app.use(bodyParser.json({ limit: '10mb' }));
    this.app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limite à 100 requêtes
      message: 'Too many requests from this IP'
    });
    this.app.use('/api/', limiter);

    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`[API] ${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Configuration des routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // API Routes
    this.app.use('/api/devices', deviceRoutes(this.orchestrator));
    this.app.use('/api/sessions', sessionRoutes(this.orchestrator));
    this.app.use('/api/queue', queueRoutes(this.orchestrator));
    this.app.use('/api/metrics', metricsRoutes(this.orchestrator));
    this.app.use('/api/health', healthRoutes(this.orchestrator));

    // Static files (si nécessaire)
    this.app.use('/static', express.static(path.join(__dirname, '../../public')));

    // Documentation API
    this.app.get('/api', (req, res) => {
      res.json({
        version: '1.0.0',
        endpoints: {
          devices: {
            'GET /api/devices': 'Liste tous les appareils',
            'GET /api/devices/:id': 'Détails d\'un appareil',
            'POST /api/devices/:id/execute': 'Exécute une tâche sur l\'appareil',
            'DELETE /api/devices/:id/session': 'Arrête la session active'
          },
          sessions: {
            'GET /api/sessions': 'Liste toutes les sessions',
            'GET /api/sessions/:id': 'Détails d\'une session',
            'POST /api/sessions': 'Crée une nouvelle session',
            'PUT /api/sessions/:id/pause': 'Met en pause une session',
            'PUT /api/sessions/:id/resume': 'Reprend une session',
            'DELETE /api/sessions/:id': 'Termine une session'
          },
          queue: {
            'GET /api/queue': 'État de la file d\'attente',
            'POST /api/queue/task': 'Ajoute une tâche',
            'DELETE /api/queue/task/:id': 'Annule une tâche',
            'GET /api/queue/stats': 'Statistiques de la file'
          },
          metrics: {
            'GET /api/metrics': 'Métriques globales',
            'GET /api/metrics/devices': 'Métriques par appareil',
            'GET /api/metrics/sessions': 'Métriques des sessions',
            'GET /api/metrics/performance': 'Métriques de performance'
          },
          health: {
            'GET /api/health/status': 'État de santé global',
            'GET /api/health/devices': 'Santé des appareils',
            'GET /api/health/services': 'Santé des services',
            'POST /api/health/check': 'Force une vérification de santé'
          }
        },
        websocket: {
          events: [
            'device:connected',
            'device:disconnected',
            'session:started',
            'session:completed',
            'task:queued',
            'task:started',
            'task:completed',
            'metrics:update',
            'health:alert'
          ]
        }
      });
    });
  }

  /**
   * Configuration WebSocket
   */
  setupWebSocket() {
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);
      this.clients.set(socket.id, socket);

      // Envoyer l'état initial
      socket.emit('initial:state', {
        devices: this.orchestrator.getGlobalStatus(),
        timestamp: new Date().toISOString()
      });

      // Gérer la déconnexion
      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        this.clients.delete(socket.id);
      });

      // Commandes depuis le client
      socket.on('command:execute', async (data) => {
        try {
          const result = await this.handleCommand(data);
          socket.emit('command:result', { success: true, result });
        } catch (error) {
          socket.emit('command:result', { success: false, error: error.message });
        }
      });

      // Subscribe aux événements spécifiques
      socket.on('subscribe', (events) => {
        socket.subscribedEvents = events;
        console.log(`[WebSocket] Client ${socket.id} subscribed to:`, events);
      });
    });

    // Relayer les événements de l'orchestrator vers WebSocket
    this.setupOrchestratorEvents();
  }

  /**
   * Configuration des événements orchestrator -> WebSocket
   */
  setupOrchestratorEvents() {
    // Vérifier si l'orchestrateur supporte les événements
    if (typeof this.orchestrator.on === 'function') {
      // Device events
      this.orchestrator.on('device:connected', (device) => {
        this.broadcast('device:connected', device);
      });

    this.orchestrator.on('device:disconnected', (device) => {
      this.broadcast('device:disconnected', device);
    });

    // Session events
    this.orchestrator.sessionManager.on('session:created', (session) => {
      this.broadcast('session:created', session);
    });

    this.orchestrator.sessionManager.on('session:started', (session) => {
      this.broadcast('session:started', session);
    });

    this.orchestrator.sessionManager.on('session:completed', (session) => {
      this.broadcast('session:completed', session);
    });

    this.orchestrator.sessionManager.on('session:error', (data) => {
      this.broadcast('session:error', data);
    });

    // Queue events
    this.orchestrator.queueManager.on('task:queued', (task) => {
      this.broadcast('task:queued', task);
    });

    this.orchestrator.queueManager.on('task:started', (task) => {
      this.broadcast('task:started', task);
    });

    this.orchestrator.queueManager.on('task:completed', (data) => {
      this.broadcast('task:completed', data);
    });

    this.orchestrator.queueManager.on('task:failed', (data) => {
      this.broadcast('task:failed', data);
    });

    // Health events
    this.orchestrator.healthMonitor.on('alert:triggered', (alert) => {
      this.broadcast('health:alert', alert);
    });

    this.orchestrator.healthMonitor.on('component:unhealthy', (component) => {
      this.broadcast('health:unhealthy', component);
    });

    this.orchestrator.healthMonitor.on('component:recovered', (component) => {
      this.broadcast('health:recovered', component);
    });

    // Periodic metrics broadcast
    setInterval(() => {
      this.broadcast('metrics:update', {
        global: this.orchestrator.getGlobalStatus(),
        queue: this.orchestrator.queueManager.getStats(),
        health: this.orchestrator.healthMonitor.getHealthStatus(),
        timestamp: new Date().toISOString()
      });
    }, 5000); // Every 5 seconds
    } // Fermeture du if
  }

  /**
   * Broadcast un événement à tous les clients WebSocket
   */
  broadcast(event, data) {
    this.clients.forEach((socket) => {
      // Vérifier si le client est abonné à cet événement
      if (!socket.subscribedEvents || socket.subscribedEvents.includes(event) || socket.subscribedEvents.includes('*')) {
        socket.emit(event, data);
      }
    });
  }

  /**
   * Gérer une commande WebSocket
   */
  async handleCommand(data) {
    const { command, params } = data;

    switch (command) {
      case 'device:scan':
        return await this.orchestrator.scanDevices();

      case 'session:create':
        return await this.orchestrator.launchSession(params.devices, params.config);

      case 'session:stop':
        return await this.orchestrator.stopSession(params.sessionId);

      case 'task:enqueue':
        return this.orchestrator.enqueueTask(params.data, params.options);

      case 'health:check':
        return await this.orchestrator.healthMonitor.forceCheckAll();

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * Gestion des erreurs
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res, next) => {
      res.status(404).json({
        error: 'Not Found',
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
        timestamp: new Date().toISOString(),
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      });
    });
  }

  /**
   * Démarrer le serveur avec un orchestrateur externe
   */
  async start(orchestrator) {
    if (orchestrator) {
      this.orchestrator = orchestrator;
    }

    // Si l'orchestrateur n'est pas encore défini, on l'initialise
    if (!this.orchestrator) {
      await this.initialize();
      return this.startServer();
    }

    // Configuration middleware
    this.setupMiddleware();

    // Routes API
    this.setupRoutes();

    // WebSocket
    this.setupWebSocket();

    // Gestion des erreurs
    this.setupErrorHandling();

    return this.startServer();
  }

  /**
   * Démarrer le serveur HTTP
   */
  async startServer() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`[API Server] Running on http://localhost:${this.port}`);
        console.log(`[API Server] WebSocket available on ws://localhost:${this.port}`);
        console.log(`[API Server] API docs: http://localhost:${this.port}/api`);
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
    if (this.orchestrator) {
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
  const server = new APIServer({
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

module.exports = APIServer;