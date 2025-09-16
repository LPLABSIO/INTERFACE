const { SessionManager, SessionState } = require('@shared/session-manager');
const ProcessManager = require('@shared/process-manager');
const StateManager = require('@shared/state-manager');
const { QueueManager, TaskPriority } = require('@shared/queue-manager');
const ErrorRecovery = require('@shared/error-recovery/src/ErrorRecovery');
const HealthMonitor = require('@shared/error-recovery/src/HealthMonitor');
const deviceDiscovery = require('../utils/device-discovery');
const path = require('path');

/**
 * Orchestrateur principal de l'application
 * Intègre tous les gestionnaires et coordonne les opérations
 */
class AppOrchestrator {
  constructor(options = {}) {
    // Initialiser les gestionnaires
    this.sessionManager = new SessionManager({
      dbPath: options.dbPath || path.join(process.cwd(), 'data', 'sessions.db'),
      maxRetries: options.maxRetries || 3,
      sessionTimeout: options.sessionTimeout || 300000
    });

    this.processManager = new ProcessManager({
      monitoringInterval: options.monitoringInterval || 5000,
      maxRestarts: options.maxRestarts || 3,
      memoryThreshold: 500 * 1024 * 1024, // 500MB
      cpuThreshold: 80 // 80%
    });

    this.stateManager = new StateManager({
      persistPath: options.statePath || path.join(process.cwd(), 'data', 'state.json'),
      autoSaveInterval: options.autoSaveInterval || 30000,
      maxHistorySize: 50
    });

    this.queueManager = new QueueManager({
      maxConcurrentTasks: options.maxConcurrentTasks || 5,
      taskTimeout: options.taskTimeout || 300000,
      allocationStrategy: options.allocationStrategy || 'round-robin',
      enableDeadLetterQueue: true
    });

    this.errorRecovery = new ErrorRecovery({
      checkpointDir: options.checkpointDir || path.join(process.cwd(), 'data', 'checkpoints'),
      maxCheckpoints: options.maxCheckpoints || 10,
      autoCleanup: true
    });

    this.healthMonitor = new HealthMonitor({
      checkInterval: options.healthCheckInterval || 30000,
      cpuThreshold: 80,
      memoryThreshold: 90
    });

    // Utiliser directement deviceDiscovery pour le moment
    this.deviceManager = deviceDiscovery;

    // État interne
    this.isInitialized = false;
    this.activeDevices = new Map();

    // Configurer les listeners
    this.setupEventListeners();
  }

  /**
   * Initialiser l'orchestrateur
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('[AppOrchestrator] Initializing...');

    try {
      // Initialiser les managers
      await this.sessionManager.initialize();
      await this.stateManager.initialize();
      await this.queueManager.initialize();
      await this.errorRecovery.initialize();
      // deviceDiscovery n'a pas de méthode initialize

      // Scanner les appareils
      await this.scanDevices();

      // Register devices with queue manager
      await this.registerDevicesWithQueue();

      this.isInitialized = true;

      console.log('[AppOrchestrator] Initialization complete');
    } catch (error) {
      console.error('[AppOrchestrator] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Configurer les listeners d'événements
   */
  setupEventListeners() {
    // SessionManager events
    this.sessionManager.on('session:created', (session) => {
      this.stateManager.set(`sessions.${session.id}`, session);
      this.broadcastEvent('session:created', session);
    });

    this.sessionManager.on('session:updated', (session) => {
      this.stateManager.set(`sessions.${session.id}`, session);
      this.broadcastEvent('session:updated', session);
    });

    this.sessionManager.on('session:completed', (session) => {
      this.stateManager.set(`sessions.${session.id}`, session);
      this.broadcastEvent('session:completed', session);
    });

    this.sessionManager.on('session:error', (session) => {
      this.stateManager.set(`sessions.${session.id}`, session);
      this.broadcastEvent('session:error', session);
    });

    // ProcessManager events
    this.processManager.on('process:started', ({ id, pid }) => {
      this.stateManager.set(`processes.${id}`, { pid, status: 'running' });
      this.broadcastEvent('process:started', { id, pid });
    });

    this.processManager.on('process:exit', ({ id, code }) => {
      const process = this.stateManager.get(`processes.${id}`);
      if (process) {
        process.status = 'stopped';
        process.exitCode = code;
        this.stateManager.set(`processes.${id}`, process);
      }
      this.broadcastEvent('process:exit', { id, code });
    });

    this.processManager.on('process:metrics', ({ id, metrics }) => {
      const process = this.stateManager.get(`processes.${id}`) || {};
      process.metrics = metrics;
      this.stateManager.set(`processes.${id}`, process);
    });

    // QueueManager events
    this.queueManager.on('task:execute', async ({ task, device }) => {
      await this.executeTask(task, device);
    });

    this.queueManager.on('task:completed', ({ task, result }) => {
      this.stateManager.set(`tasks.completed.${task.id}`, { task, result, completedAt: new Date() });
      this.broadcastEvent('task:completed', { task, result });
    });

    this.queueManager.on('task:failed', async ({ task, error }) => {
      this.stateManager.set(`tasks.failed.${task.id}`, { task, error, failedAt: new Date() });
      this.broadcastEvent('task:failed', { task, error });

      // Attempt error recovery
      const recovery = await this.errorRecovery.handleError(task, error);
      if (recovery && recovery.success) {
        if (recovery.action === 'retry') {
          // Re-enqueue task for retry
          this.enqueueTask(task.data, { priority: task.priority, metadata: { ...task.metadata, retry: true } });
        } else if (recovery.action === 'rollback' && recovery.checkpoint) {
          // Restore checkpoint state
          const restored = await this.errorRecovery.restoreCheckpoint(recovery.checkpoint.id);
          this.broadcastEvent('task:restored', { task, checkpoint: recovery.checkpoint });
        }
      }
    });

    // ErrorRecovery events
    this.errorRecovery.on('checkpoint:created', ({ taskId, checkpointId }) => {
      this.stateManager.set(`checkpoints.${taskId}.${checkpointId}`, { createdAt: new Date() });
      this.broadcastEvent('checkpoint:created', { taskId, checkpointId });
    });

    this.errorRecovery.on('recovery:success', (data) => {
      this.broadcastEvent('recovery:success', data);
    });

    this.errorRecovery.on('recovery:failed', (data) => {
      this.broadcastEvent('recovery:failed', data);
    });

    // HealthMonitor events
    this.healthMonitor.on('component:unhealthy', (component) => {
      this.stateManager.set(`health.unhealthy.${component.id}`, component);
      this.broadcastEvent('component:unhealthy', component);
    });

    this.healthMonitor.on('component:recovered', (component) => {
      this.stateManager.delete(`health.unhealthy.${component.id}`);
      this.broadcastEvent('component:recovered', component);
    });

    this.healthMonitor.on('alert:triggered', (alert) => {
      this.stateManager.set(`alerts.${Date.now()}`, alert);
      this.broadcastEvent('alert:triggered', alert);
    });

    // DeviceManager events - Commented out as deviceDiscovery is not an EventEmitter
    // TODO: Wrap deviceDiscovery in an EventEmitter class for proper event handling
    /*
    this.deviceManager.on('device:connected', (device) => {
      this.stateManager.set(`devices.${device.udid}`, device);
      this.broadcastEvent('device:connected', device);
    });

    this.deviceManager.on('device:disconnected', (udid) => {
      const device = this.stateManager.get(`devices.${udid}`);
      if (device) {
        device.status = 'disconnected';
        this.stateManager.set(`devices.${udid}`, device);
      }
      this.broadcastEvent('device:disconnected', udid);
    });
    */
  }

  /**
   * Scanner les appareils iOS connectés
   */
  async scanDevices() {
    // Pour l'instant, utiliser une méthode simple pour lister les appareils
    // En production, cela devrait être intégré avec le vrai système de détection
    const { spawnSync } = require('child_process');
    const devices = [];

    try {
      // Essayer avec idevice_id
      const ideviceIdPath = '/opt/homebrew/bin/idevice_id';
      const res = spawnSync(ideviceIdPath, ['-l'], { encoding: 'utf8' });

      if (res && res.status === 0 && res.stdout) {
        const udids = res.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

        for (const udid of udids) {
          let name = 'iPhone';
          try {
            const info = spawnSync('/opt/homebrew/bin/ideviceinfo', ['-u', udid, '-k', 'DeviceName'], { encoding: 'utf8' });
            if (info && info.status === 0 && info.stdout) {
              name = info.stdout.trim() || name;
            }
          } catch (e) {
            // Ignorer l'erreur
          }

          const device = { type: 'ios', name, udid };
          devices.push(device);
          this.stateManager.set(`devices.${udid}`, device);
        }
      }
    } catch (error) {
      console.warn('[AppOrchestrator] Could not scan devices:', error.message);
    }

    return devices;
  }

  /**
   * Lancer une session sur un ou plusieurs appareils
   */
  async launchSession(deviceIds, config) {
    const sessions = [];

    for (const deviceId of deviceIds) {
      const device = this.stateManager.get(`devices.${deviceId}`);
      if (!device) {
        console.error(`[AppOrchestrator] Device ${deviceId} not found`);
        continue;
      }

      try {
        // Créer la session
        const session = await this.sessionManager.createSession(deviceId, config);

        // Démarrer le processus bot
        const processId = `bot-${deviceId}`;
        await this.processManager.spawnProcess(
          processId,
          'node',
          [
            path.join(process.cwd(), 'src', 'bot', 'bot.js'),
            device.name || deviceId,
            config.app || 'hinge',
            config.accountsNumber || '1',
            config.proxyProvider || 'marsproxies'
          ],
          {
            env: {
              ...process.env,
              DEVICE_UDID: deviceId,
              SESSION_ID: session.id,
              APPIUM_PORT: device.appiumPort || '1265',
              WDA_PORT: device.wdaPort || '8100',
              WDA_URL: `http://127.0.0.1:${device.wdaPort || '8100'}`
            },
            cwd: process.cwd(),
            autoRestart: true
          }
        );

        // Associer le processus à la session
        session.processId = processId;
        await this.sessionManager.updateSession(session.id, session);

        // Démarrer la session
        await this.sessionManager.startSession(session.id);

        sessions.push(session);

      } catch (error) {
        console.error(`[AppOrchestrator] Failed to launch session for ${deviceId}:`, error);
      }
    }

    return sessions;
  }

  /**
   * Arrêter une session
   */
  async stopSession(sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Arrêter le processus associé
    if (session.processId) {
      await this.processManager.killProcess(session.processId);
    }

    // Marquer la session comme terminée
    await this.sessionManager.completeSession(sessionId);
  }

  /**
   * Obtenir l'état d'un appareil
   */
  async getDeviceStatus(deviceId) {
    const device = this.stateManager.get(`devices.${deviceId}`);
    if (!device) {
      return null;
    }

    // Ajouter les informations de session active
    const sessions = this.sessionManager.getDeviceSessions(deviceId);
    const activeSession = sessions.find(s =>
      s.state === SessionState.RUNNING || s.state === SessionState.PAUSED
    );

    // Ajouter les métriques du processus
    let processMetrics = null;
    if (activeSession && activeSession.processId) {
      processMetrics = await this.processManager.getProcessMetrics(activeSession.processId);
    }

    return {
      ...device,
      activeSession,
      processMetrics,
      status: activeSession ? 'busy' : 'available'
    };
  }

  /**
   * Obtenir l'état global de l'application
   */
  getGlobalStatus() {
    const devices = Array.from(this.stateManager.state.devices.values());
    const sessions = Array.from(this.stateManager.state.sessions.values());
    const processes = this.processManager.getAllProcesses();

    return {
      devices: {
        total: devices.length,
        connected: devices.filter(d => d.status !== 'disconnected').length,
        busy: sessions.filter(s => s.state === SessionState.RUNNING).length
      },
      sessions: {
        total: sessions.length,
        active: sessions.filter(s =>
          s.state === SessionState.RUNNING || s.state === SessionState.PAUSED
        ).length,
        completed: sessions.filter(s => s.state === SessionState.COMPLETED).length,
        failed: sessions.filter(s =>
          s.state === SessionState.ERROR || s.state === SessionState.TERMINATED
        ).length
      },
      processes: {
        total: processes.length,
        running: processes.filter(p => p.status === 'running').length,
        crashed: processes.filter(p => p.status === 'crashed').length
      },
      metrics: {
        ...this.sessionManager.getMetrics(),
        ...this.processManager.getStats()
      },
      health: this.healthMonitor.getHealthStatus(),
      recovery: this.errorRecovery.getStats()
    };
  }

  /**
   * Émettre un événement global
   */
  broadcastEvent(event, data) {
    // Pour l'instant, juste logger
    // Plus tard, on pourra émettre via WebSocket ou IPC
    console.log(`[AppOrchestrator] Event: ${event}`, data);
  }

  /**
   * S'abonner aux changements d'état
   */
  subscribe(path, callback) {
    return this.stateManager.subscribe(path, callback);
  }

  /**
   * Obtenir les logs d'un processus
   */
  getProcessLogs(processId, limit = 100) {
    return this.processManager.getProcessLogs(processId, limit);
  }

  /**
   * Redémarrer un processus
   */
  async restartProcess(processId) {
    return this.processManager.restartProcess(processId);
  }

  /**
   * Enqueue a task
   * @param {Object} taskData - Task data
   * @param {Object} options - Task options
   * @returns {Object} Created task
   */
  enqueueTask(taskData, options = {}) {
    return this.queueManager.submitTask(taskData, options);
  }


  /**
   * Execute a task (called by queue manager)
   * @param {Object} task - Task to execute
   * @param {Object} device - Device to execute on
   */
  async executeTask(task, device) {
    try {
      // Notify task started
      this.queueManager.startTask(task.id);

      // Create checkpoint before starting
      const checkpointId = await this.errorRecovery.createCheckpoint(task.id, {
        task: task.data,
        device: device.id,
        timestamp: new Date()
      });

      // Create session for task
      const session = await this.sessionManager.createSession(device.id, {
        taskId: task.id,
        checkpointId,
        ...task.data.config
      });

      // Start process based on task type
      const processId = `task-${task.id}`;

      if (task.data.type === 'bot') {
        // Launch bot process
        await this.processManager.spawnProcess(
          processId,
          'node',
          [
            path.join(process.cwd(), 'src', 'bot', 'bot.js'),
            device.name || device.id,
            task.data.app || 'hinge',
            task.data.accountsNumber || '1',
            task.data.proxyProvider || 'marsproxies'
          ],
          {
            env: {
              ...process.env,
              DEVICE_UDID: device.id,
              SESSION_ID: session.id,
              TASK_ID: task.id,
              APPIUM_PORT: device.appiumPort || '1265',
              WDA_PORT: device.wdaPort || '8100'
            },
            cwd: process.cwd()
          }
        );
      } else if (task.data.type === 'test') {
        // Launch test process
        await this.processManager.spawnProcess(
          processId,
          'npm',
          ['test', '--', task.data.testFile],
          {
            env: {
              ...process.env,
              DEVICE_UDID: device.id,
              SESSION_ID: session.id,
              TASK_ID: task.id
            },
            cwd: process.cwd()
          }
        );
      }

      // Monitor process completion
      this.processManager.once(`process:exit:${processId}`, async ({ code }) => {
        if (code === 0) {
          await this.sessionManager.completeSession(session.id);
          this.queueManager.completeTask(task.id, { sessionId: session.id, exitCode: code });
        } else {
          await this.sessionManager.failSession(session.id, new Error(`Process exited with code ${code}`));
          this.queueManager.failTask(task.id, new Error(`Process exited with code ${code}`));
        }
      });

      // Start session
      await this.sessionManager.startSession(session.id);

    } catch (error) {
      console.error(`[AppOrchestrator] Failed to execute task ${task.id}:`, error);
      this.queueManager.failTask(task.id, error);
    }
  }

  /**
   * Register devices with queue manager
   */
  async registerDevicesWithQueue() {
    const devices = await this.scanDevices();

    for (const device of devices) {
      this.queueManager.registerDevice({
        id: device.udid,
        name: device.name,
        capabilities: ['ios', 'automation'],
        maxConcurrentTasks: 1
      });

      // Register device with health monitor
      this.healthMonitor.registerDevice(device.udid, {
        name: device.name,
        appiumPort: device.appiumPort,
        wdaPort: device.wdaPort
      });
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getQueueStats() {
    return this.queueManager.getStats();
  }

  /**
   * Nettoyer les anciennes sessions
   */
  async cleanup(daysToKeep = 7) {
    await this.sessionManager.store.cleanup(daysToKeep);
  }

  /**
   * Arrêter proprement l'orchestrateur
   */
  async shutdown() {
    console.log('[AppOrchestrator] Shutting down...');

    // Arrêter toutes les sessions actives
    const activeSessions = this.sessionManager.getActiveSessions();
    for (const session of activeSessions) {
      await this.stopSession(session.id);
    }

    // Arrêter les managers
    await this.sessionManager.shutdown();
    await this.processManager.shutdown();
    await this.queueManager.shutdown();
    await this.errorRecovery.shutdown();
    await this.healthMonitor.shutdown();
    await this.stateManager.shutdown();

    this.isInitialized = false;

    console.log('[AppOrchestrator] Shutdown complete');
  }
}

module.exports = AppOrchestrator;