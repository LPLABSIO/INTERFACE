const fs = require('fs').promises;
const path = require('path');
const { getInstance: getUnifiedStateManager } = require('./UnifiedStateManager');

/**
 * Gestionnaire de queue pour la production multi-appareils
 * Permet la distribution automatique des tâches entre appareils
 */
class QueueManager {
  constructor(configPath = null) {
    // MIGRATION: On garde configPath pour compatibilité mais on utilise UnifiedStateManager
    this.configPath = configPath || path.join(__dirname, '../../config/app/queue-state.json');
    this.stateManager = null; // Sera initialisé dans initialize()
    this.state = {
      tasks: [],
      stats: {
        total: 0,
        pending: 0,
        inProgress: 0,
        completed: 0,
        failed: 0
      },
      deviceAssignments: {} // deviceId -> taskIds
    };
    this.lockTimeout = 30000; // 30 secondes avant de considérer une tâche abandonnée
  }

  /**
   * Initialise le gestionnaire de queue
   */
  async initialize() {
    console.log('[QueueManager] Initializing with UnifiedStateManager...');

    try {
      // Initialiser UnifiedStateManager
      this.stateManager = getUnifiedStateManager();
      if (!this.stateManager.isInitialized) {
        await this.stateManager.initialize();
      }

      // Charger l'état depuis UnifiedStateManager
      await this.loadState();

      // Nettoyer les tâches abandonnées
      // Au démarrage, toutes les tâches in_progress sont forcément abandonnées (crash)
      await this.cleanupAbandonedTasks(true);

      // Démarrer un nettoyage périodique (toutes les 10 secondes)
      this.cleanupInterval = setInterval(async () => {
        await this.cleanupAbandonedTasks(false);
      }, 10000);

      console.log('[QueueManager] Initialized with', this.state.tasks.length, 'tasks');
      console.log('[QueueManager] Tasks:', this.state.tasks.map(t => ({ id: t.id, status: t.status })));
      console.log('[QueueManager] Periodic cleanup enabled (every 10s)');
    } catch (error) {
      console.error('[QueueManager] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Charge l'état depuis UnifiedStateManager
   */
  async loadState() {
    try {
      // Charger depuis UnifiedStateManager
      const queueState = this.stateManager.get('queue');

      if (queueState && Object.keys(queueState).length > 0) {
        this.state = queueState;
        console.log('[QueueManager] State loaded from UnifiedStateManager, tasks:', this.state.tasks?.length || 0);
      } else {
        console.log('[QueueManager] No existing queue state, initializing with defaults');
        // Initialiser avec les valeurs par défaut
        this.state = {
          tasks: [],
          stats: {
            total: 0,
            pending: 0,
            inProgress: 0,
            completed: 0,
            failed: 0
          },
          deviceAssignments: {}
        };
        await this.saveState();
      }
    } catch (error) {
      console.error('[QueueManager] Error loading state:', error);
      throw error;
    }
  }

  /**
   * Sauvegarde l'état dans UnifiedStateManager
   */
  async saveState() {
    // Sauvegarder dans UnifiedStateManager
    await this.stateManager.set('queue', this.state);
    // La rétrocompatibilité avec l'ancien fichier est gérée automatiquement par UnifiedStateManager
    console.log('[QueueManager] State saved via UnifiedStateManager');
  }

  /**
   * Ajoute des tâches à la queue
   * @param {number} count - Nombre de comptes à créer
   * @param {Object} config - Configuration pour les tâches
   */
  async addBatch(count, config = {}) {
    const newTasks = [];
    const startId = this.state.tasks.length > 0
      ? Math.max(...this.state.tasks.map(t => t.id)) + 1
      : 1;

    for (let i = 0; i < count; i++) {
      newTasks.push({
        id: startId + i,
        type: 'create_account',
        status: 'pending',
        config: {
          app: config.app || 'hinge',
          proxyProvider: config.proxyProvider || 'marsproxies',
          ...config
        },
        createdAt: new Date().toISOString(),
        attempts: 0,
        maxAttempts: 3
      });
    }

    this.state.tasks.push(...newTasks);
    this.updateStats();
    await this.saveState();

    // console.log(`[QueueManager] Added ${count} tasks to queue`);
    return newTasks;
  }

  /**
   * Récupère la prochaine tâche disponible pour un appareil
   * @param {string} deviceId - ID de l'appareil
   */
  async getNextTask(deviceId) {
    console.log(`[QueueManager] getNextTask called with deviceId: ${deviceId}`);
    console.log(`[QueueManager] Current tasks count: ${this.state.tasks.length}`);

    // Nettoyer d'abord les tâches abandonnées
    await this.cleanupAbandonedTasks();

    // Trouver une tâche pending
    const task = this.state.tasks.find(t =>
      t.status === 'pending' ||
      (t.status === 'failed' && t.attempts < t.maxAttempts)
    );

    if (!task) {
      console.log('[QueueManager] No pending tasks found');
      return null; // Plus de tâches disponibles
    }

    console.log(`[QueueManager] Found task #${task.id} with status: ${task.status}`);

    // Marquer comme en cours
    task.status = 'in_progress';
    task.deviceId = deviceId;
    task.startedAt = new Date().toISOString();
    task.attempts++;

    // Enregistrer l'assignation
    if (!this.state.deviceAssignments[deviceId]) {
      this.state.deviceAssignments[deviceId] = [];
    }
    this.state.deviceAssignments[deviceId].push(task.id);

    this.updateStats();
    await this.saveState();

    console.log(`[QueueManager] Task ${task.id} assigned to ${deviceId} (attempt ${task.attempts})`);
    return task;
  }

  /**
   * Marque une tâche comme complétée
   * @param {string} deviceId - ID de l'appareil
   * @param {number} taskId - ID de la tâche
   * @param {Object} result - Résultat de la tâche
   */
  async markCompleted(deviceId, taskId, result = {}) {
    const task = this.state.tasks.find(t => t.id === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.deviceId !== deviceId) {
      throw new Error(`Task ${taskId} not assigned to ${deviceId}`);
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;

    // Retirer de l'assignation
    const deviceTasks = this.state.deviceAssignments[deviceId];
    if (deviceTasks) {
      const index = deviceTasks.indexOf(taskId);
      if (index > -1) {
        deviceTasks.splice(index, 1);
      }
    }

    this.updateStats();
    await this.saveState();

    // console.log(`[QueueManager] Task ${taskId} completed by ${deviceId}`);
  }

  /**
   * Marque une tâche comme échouée
   * @param {string} deviceId - ID de l'appareil
   * @param {number} taskId - ID de la tâche
   * @param {string} error - Message d'erreur
   */
  async markFailed(deviceId, taskId, error) {
    const task = this.state.tasks.find(t => t.id === taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.deviceId !== deviceId) {
      throw new Error(`Task ${taskId} not assigned to ${deviceId}`);
    }

    task.status = task.attempts >= task.maxAttempts ? 'failed' : 'pending';

    task.lastError = error;
    task.failedAt = new Date().toISOString();

    if (task.status === 'pending') {
      // Remettre en pending pour réessayer
      delete task.deviceId;
      delete task.startedAt;
    }

    // Retirer de l'assignation
    const deviceTasks = this.state.deviceAssignments[deviceId];
    if (deviceTasks) {
      const index = deviceTasks.indexOf(taskId);
      if (index > -1) {
        deviceTasks.splice(index, 1);
      }
    }

    this.updateStats();
    await this.saveState();

    // console.log(`[QueueManager] Task ${taskId} failed (attempt ${task.attempts}/${task.maxAttempts})`);
  }

  /**
   * Nettoie les tâches abandonnées (timeout ou crash)
   * @param {boolean} isStartup - Si true, reset toutes les tâches in_progress (crash recovery)
   */
  async cleanupAbandonedTasks(isStartup = false) {
    const now = Date.now();
    let cleaned = 0;
    let recoveredFromCrash = 0;

    for (const task of this.state.tasks) {
      if (task.status === 'in_progress') {
        let shouldReset = false;

        if (isStartup) {
          // Au démarrage, toutes les tâches in_progress sont abandonnées (crash/restart)
          shouldReset = true;
          recoveredFromCrash++;
          console.log(`[QueueManager] 🔄 Recovering task ${task.id} from crash (was in_progress)`);
        } else if (task.startedAt) {
          // En runtime, vérifier le timeout
          const startTime = new Date(task.startedAt).getTime();
          if (now - startTime > this.lockTimeout) {
            shouldReset = true;
            console.log(`[QueueManager] ⏱️ Task ${task.id} timed out after ${Math.round((now - startTime) / 1000)}s`);
          }
        }

        if (shouldReset) {
          // Remettre la tâche en pending
          task.status = 'pending';
          delete task.deviceId;
          delete task.startedAt;
          cleaned++;

          // Nettoyer aussi les assignations d'appareils si nécessaire
          if (task.deviceId && this.state.deviceAssignments[task.deviceId]) {
            const deviceTasks = this.state.deviceAssignments[task.deviceId];
            const index = deviceTasks.indexOf(task.id);
            if (index > -1) {
              deviceTasks.splice(index, 1);
            }
          }
        }
      }
    }

    // Nettoyer les assignations d'appareils orphelines au démarrage
    if (isStartup) {
      for (const deviceId in this.state.deviceAssignments) {
        this.state.deviceAssignments[deviceId] = [];
      }
      if (recoveredFromCrash > 0) {
        console.log(`[QueueManager] ✅ Recovered ${recoveredFromCrash} tasks from previous crash`);
      }
    }

    if (cleaned > 0) {
      this.updateStats();
      await this.saveState();
      if (!isStartup) {
        console.log(`[QueueManager] Cleaned up ${cleaned} abandoned tasks`);
      }
    }
  }

  /**
   * Met à jour les statistiques
   */
  updateStats() {
    this.state.stats = {
      total: this.state.tasks.length,
      pending: this.state.tasks.filter(t => t.status === 'pending').length,
      inProgress: this.state.tasks.filter(t => t.status === 'in_progress').length,
      completed: this.state.tasks.filter(t => t.status === 'completed').length,
      failed: this.state.tasks.filter(t => t.status === 'failed').length
    };
  }

  /**
   * Obtient les statistiques de la queue
   */
  getStats() {
    return {
      ...this.state.stats,
      deviceAssignments: Object.keys(this.state.deviceAssignments).reduce((acc, deviceId) => {
        acc[deviceId] = this.state.deviceAssignments[deviceId].length;
        return acc;
      }, {})
    };
  }

  /**
   * Obtient le statut d'un appareil
   * @param {string} deviceId - ID de l'appareil
   */
  getDeviceStatus(deviceId) {
    const taskIds = this.state.deviceAssignments[deviceId] || [];
    const tasks = taskIds.map(id => this.state.tasks.find(t => t.id === id)).filter(Boolean);

    return {
      deviceId,
      activeTasks: tasks.filter(t => t.status === 'in_progress'),
      completedCount: this.state.tasks.filter(t =>
        t.status === 'completed' && t.deviceId === deviceId
      ).length
    };
  }

  /**
   * Vide la queue complètement
   */
  async clearQueue() {
    this.state.tasks = [];
    this.state.deviceAssignments = {};
    this.updateStats();
    await this.saveState();
    // console.log('[QueueManager] Queue cleared');
  }

  /**
   * Obtient toutes les tâches
   */
  getTasks() {
    return this.state.tasks;
  }

  /**
   * Arrête proprement le gestionnaire de queue
   */
  async shutdown() {
    console.log('[QueueManager] Shutting down...');

    // Arrêter le nettoyage périodique
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[QueueManager] Periodic cleanup stopped');
    }

    // Sauvegarder l'état final
    await this.saveState();
    console.log('[QueueManager] Final state saved');
  }
}

module.exports = QueueManager;