/**
 * Queue Adapter - Adaptateur pour le mode queue
 * Utilise QueueManager pour la gestion des tâches
 */

const QueueManager = require('../../src/core/QueueManager');

class QueueAdapter {
  constructor() {
    // Utiliser le chemin absolu vers le fichier queue-state.json
    const path = require('path');
    const configPath = path.join(__dirname, '../../config/app/queue-state.json');
    this.queueManager = new QueueManager(configPath);
    this.currentTask = null;
    this.deviceId = null;
  }

  /**
   * Vérifie si le mode queue est activé
   */
  static isQueueMode() {
    return process.env.USE_QUEUE === 'true' || process.env.QUEUE_MODE === 'true';
  }

  /**
   * Initialise le QueueManager
   */
  async initialize() {
    await this.queueManager.initialize();
  }

  /**
   * Récupère la prochaine tâche de la queue
   */
  async getNextTask() {
    // Récupérer le deviceId depuis l'environnement
    this.deviceId = process.env.QUEUE_DEVICE_ID || process.env.DEVICE_UDID || 'default';

    // Passer le deviceId au QueueManager
    this.currentTask = await this.queueManager.getNextTask(this.deviceId);
    return this.currentTask;
  }

  /**
   * Marque une tâche comme complétée
   */
  async markCompleted(result) {
    if (!this.currentTask || !this.deviceId) {
      console.error('[QueueAdapter] No current task to mark as completed');
      return false;
    }

    if (this.queueManager.markCompleted) {
      return await this.queueManager.markCompleted(this.deviceId, this.currentTask.id, result);
    }
    return true;
  }

  /**
   * Marque une tâche comme échouée
   */
  async markFailed(error) {
    if (!this.currentTask || !this.deviceId) {
      console.error('[QueueAdapter] No current task to mark as failed');
      return false;
    }

    if (this.queueManager.markFailed) {
      return await this.queueManager.markFailed(this.deviceId, this.currentTask.id, error);
    }
    return true;
  }
}

module.exports = QueueAdapter;