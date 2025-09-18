const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

/**
 * Adaptateur pour permettre au bot d'utiliser le système de queue
 */
class QueueAdapter {
  constructor() {
    this.queuePath = path.join(__dirname, '../../config/app/queue-state.json');
    this.deviceId = process.env.QUEUE_DEVICE_ID || 'unknown';
    this.currentTask = null;
  }

  /**
   * Récupère la prochaine tâche depuis la queue
   */
  async getNextTask() {
    try {
      // Lire directement le fichier JSON pour éviter les dépendances IPC
      const data = await fs.readFile(this.queuePath, 'utf8');
      const state = JSON.parse(data);

      // Nettoyer les tâches abandonnées
      const now = Date.now();
      const timeout = 30000; // 30 secondes

      for (const task of state.tasks) {
        if (task.status === 'in_progress' && task.startedAt) {
          const startTime = new Date(task.startedAt).getTime();
          if (now - startTime > timeout && task.deviceId !== this.deviceId) {
            task.status = 'pending';
            delete task.deviceId;
            delete task.startedAt;
          }
        }
      }

      // Trouver une tâche disponible
      const task = state.tasks.find(t =>
        t.status === 'pending' ||
        (t.status === 'failed' && t.attempts < (t.maxAttempts || 3))
      );

      if (!task) {
        return null; // Plus de tâches
      }

      // Marquer comme en cours
      task.status = 'in_progress';
      task.deviceId = this.deviceId;
      task.startedAt = new Date().toISOString();
      task.attempts = (task.attempts || 0) + 1;

      // Sauvegarder l'état
      await this.saveState(state);

      this.currentTask = task;
      console.log(`[Queue] Task ${task.id} assigned to ${this.deviceId}`);
      return task;

    } catch (error) {
      console.error('[Queue] Error getting next task:', error);
      return null;
    }
  }

  /**
   * Marque la tâche courante comme complétée
   */
  async markCompleted(result = {}) {
    if (!this.currentTask) return;

    try {
      const data = await fs.readFile(this.queuePath, 'utf8');
      const state = JSON.parse(data);

      const task = state.tasks.find(t => t.id === this.currentTask.id);
      if (task) {
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        task.result = result;

        await this.saveState(state);
        console.log(`[Queue] Task ${task.id} completed`);
      }

      this.currentTask = null;
    } catch (error) {
      console.error('[Queue] Error marking task completed:', error);
    }
  }

  /**
   * Marque la tâche courante comme échouée
   */
  async markFailed(error) {
    if (!this.currentTask) return;

    try {
      const data = await fs.readFile(this.queuePath, 'utf8');
      const state = JSON.parse(data);

      const task = state.tasks.find(t => t.id === this.currentTask.id);
      if (task) {
        const maxAttempts = task.maxAttempts || 3;
        task.status = task.attempts >= maxAttempts ? 'failed' : 'pending';
        task.lastError = error;
        task.failedAt = new Date().toISOString();

        if (task.status === 'pending') {
          // Remettre en pending pour réessayer
          delete task.deviceId;
          delete task.startedAt;
        }

        await this.saveState(state);
        console.log(`[Queue] Task ${task.id} failed (attempt ${task.attempts}/${maxAttempts})`);
      }

      this.currentTask = null;
    } catch (error) {
      console.error('[Queue] Error marking task failed:', error);
    }
  }

  /**
   * Sauvegarde l'état dans le fichier
   */
  async saveState(state) {
    const tempPath = this.queuePath + '.tmp';
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2));
    await fs.rename(tempPath, this.queuePath);
  }

  /**
   * Vérifie si le mode queue est activé
   */
  static isQueueMode() {
    return process.env.USE_QUEUE === 'true';
  }
}

module.exports = QueueAdapter;