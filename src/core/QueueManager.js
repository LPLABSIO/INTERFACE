const fs = require('fs').promises;
const path = require('path');

/**
 * Gestionnaire de queue pour la production multi-appareils
 * Permet la distribution automatique des tâches entre appareils
 */
class QueueManager {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, '../../config/app/queue-state.json');
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
    console.log('[QueueManager] Initializing...');

    try {
      // Créer le dossier si nécessaire
      const dir = path.dirname(this.configPath);
      await fs.mkdir(dir, { recursive: true });

      // Charger l'état existant
      await this.loadState();

      // Nettoyer les tâches abandonnées
      await this.cleanupAbandonedTasks();

      console.log('[QueueManager] Initialized with', this.state.tasks.length, 'tasks');
    } catch (error) {
      console.error('[QueueManager] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Charge l'état depuis le fichier
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.state = JSON.parse(data);
      console.log('[QueueManager] State loaded from file');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('[QueueManager] No existing state, starting fresh');
        await this.saveState();
      } else {
        throw error;
      }
    }
  }

  /**
   * Sauvegarde l'état dans le fichier
   */
  async saveState() {
    const tempPath = this.configPath + '.tmp';
    await fs.writeFile(tempPath, JSON.stringify(this.state, null, 2));
    await fs.rename(tempPath, this.configPath);
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

    console.log(`[QueueManager] Added ${count} tasks to queue`);
    return newTasks;
  }

  /**
   * Récupère la prochaine tâche disponible pour un appareil
   * @param {string} deviceId - ID de l'appareil
   */
  async getNextTask(deviceId) {
    // Nettoyer d'abord les tâches abandonnées
    await this.cleanupAbandonedTasks();

    // Trouver une tâche pending
    const task = this.state.tasks.find(t =>
      t.status === 'pending' ||
      (t.status === 'failed' && t.attempts < t.maxAttempts)
    );

    if (!task) {
      return null; // Plus de tâches disponibles
    }

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

    console.log(`[QueueManager] Task ${task.id} assigned to ${deviceId}`);
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

    console.log(`[QueueManager] Task ${taskId} completed by ${deviceId}`);
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

    console.log(`[QueueManager] Task ${taskId} failed (attempt ${task.attempts}/${task.maxAttempts})`);
  }

  /**
   * Nettoie les tâches abandonnées (timeout)
   */
  async cleanupAbandonedTasks() {
    const now = Date.now();
    let cleaned = 0;

    for (const task of this.state.tasks) {
      if (task.status === 'in_progress' && task.startedAt) {
        const startTime = new Date(task.startedAt).getTime();
        if (now - startTime > this.lockTimeout) {
          // Tâche abandonnée, la remettre en pending
          task.status = 'pending';
          delete task.deviceId;
          delete task.startedAt;
          cleaned++;
        }
      }
    }

    if (cleaned > 0) {
      this.updateStats();
      await this.saveState();
      console.log(`[QueueManager] Cleaned up ${cleaned} abandoned tasks`);
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
    console.log('[QueueManager] Queue cleared');
  }

  /**
   * Obtient toutes les tâches
   */
  getTasks() {
    return this.state.tasks;
  }
}

module.exports = QueueManager;