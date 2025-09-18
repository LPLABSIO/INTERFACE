const EventEmitter = require('eventemitter3');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Error Recovery System with Checkpointing
 * Handles task recovery, state rollback, and error analysis
 */
class ErrorRecovery extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.checkpointDir = options.checkpointDir || path.join(process.cwd(), 'data', 'checkpoints');
    this.maxCheckpoints = options.maxCheckpoints || 10;
    this.autoCleanup = options.autoCleanup !== false;
    this.cleanupInterval = options.cleanupInterval || 3600000; // 1 hour
    this.recoveryStrategies = new Map();

    // State
    this.checkpoints = new Map();
    this.failureHistory = [];
    this.recoveryInProgress = new Set();

    // Statistics
    this.stats = {
      checkpointsSaved: 0,
      checkpointsRestored: 0,
      recoveriesAttempted: 0,
      recoveriesSucceeded: 0,
      recoveriesFailed: 0
    };

    // Setup default recovery strategies
    this.setupDefaultStrategies();

    // Start cleanup timer if enabled
    if (this.autoCleanup) {
      this.startCleanupTimer();
    }
  }

  /**
   * Initialize the error recovery system
   */
  async initialize() {
    // Create checkpoint directory if it doesn't exist
    try {
      await fs.mkdir(this.checkpointDir, { recursive: true });
    } catch (error) {
      console.error('[ErrorRecovery] Failed to create checkpoint directory:', error);
    }

    // Load existing checkpoints
    await this.loadCheckpoints();

    // console.log('[ErrorRecovery] Initialized with', this.checkpoints.size, 'checkpoints');
  }

  /**
   * Setup default recovery strategies
   */
  setupDefaultStrategies() {
    // Retry strategy
    this.registerStrategy('retry', async (context) => {
      const { task, error, retryCount = 0, maxRetries = 3 } = context;

      if (retryCount >= maxRetries) {
        return { success: false, reason: 'Max retries exceeded' };
      }

      // console.log(`[ErrorRecovery] Retrying task ${task.id} (attempt ${retryCount + 1}/${maxRetries})`);

      // Wait with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      await this.delay(delay);

      return {
        success: true,
        action: 'retry',
        context: { ...context, retryCount: retryCount + 1 }
      };
    });

    // Rollback strategy
    this.registerStrategy('rollback', async (context) => {
      const { task, checkpoint } = context;

      if (!checkpoint) {
        return { success: false, reason: 'No checkpoint available' };
      }

      // console.log(`[ErrorRecovery] Rolling back task ${task.id} to checkpoint ${checkpoint.id}`);

      return {
        success: true,
        action: 'rollback',
        checkpoint
      };
    });

    // Skip strategy
    this.registerStrategy('skip', async (context) => {
      const { task } = context;

      // console.log(`[ErrorRecovery] Skipping failed task ${task.id}`);

      return {
        success: true,
        action: 'skip'
      };
    });

    // Restart strategy
    this.registerStrategy('restart', async (context) => {
      const { task } = context;

      // console.log(`[ErrorRecovery] Restarting task ${task.id} from beginning`);

      // Clear task state
      const cleanTask = {
        ...task,
        state: 'pending',
        progress: 0,
        error: null
      };

      return {
        success: true,
        action: 'restart',
        task: cleanTask
      };
    });
  }

  /**
   * Register a recovery strategy
   */
  registerStrategy(name, handler) {
    this.recoveryStrategies.set(name, handler);
      // console.log(`[ErrorRecovery] Registered strategy: ${name}`);
  }

  /**
   * Create a checkpoint for a task
   */
  async createCheckpoint(taskId, state, metadata = {}) {
    const checkpointId = uuidv4();
    const checkpoint = {
      id: checkpointId,
      taskId,
      state: this.serializeState(state),
      metadata,
      createdAt: new Date().toISOString()
    };

    // Save to memory
    if (!this.checkpoints.has(taskId)) {
      this.checkpoints.set(taskId, []);
    }

    const taskCheckpoints = this.checkpoints.get(taskId);
    taskCheckpoints.push(checkpoint);

    // Limit checkpoints per task
    if (taskCheckpoints.length > this.maxCheckpoints) {
      const removed = taskCheckpoints.shift();
      await this.deleteCheckpointFile(removed.id);
    }

    // Save to disk
    await this.saveCheckpointFile(checkpoint);

    this.stats.checkpointsSaved++;
    this.emit('checkpoint:created', { taskId, checkpointId });

      // console.log(`[ErrorRecovery] Created checkpoint ${checkpointId} for task ${taskId}`);

    return checkpointId;
  }

  /**
   * Get the latest checkpoint for a task
   */
  async getLatestCheckpoint(taskId) {
    const taskCheckpoints = this.checkpoints.get(taskId);
    if (!taskCheckpoints || taskCheckpoints.length === 0) {
      return null;
    }

    return taskCheckpoints[taskCheckpoints.length - 1];
  }

  /**
   * Restore from a checkpoint
   */
  async restoreCheckpoint(checkpointId) {
    // Find checkpoint
    let checkpoint = null;
    for (const taskCheckpoints of this.checkpoints.values()) {
      checkpoint = taskCheckpoints.find(cp => cp.id === checkpointId);
      if (checkpoint) break;
    }

    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const state = this.deserializeState(checkpoint.state);

    this.stats.checkpointsRestored++;
    this.emit('checkpoint:restored', {
      taskId: checkpoint.taskId,
      checkpointId,
      state
    });

      // console.log(`[ErrorRecovery] Restored checkpoint ${checkpointId}`);

    return {
      taskId: checkpoint.taskId,
      state,
      metadata: checkpoint.metadata
    };
  }

  /**
   * Handle an error and attempt recovery
   */
  async handleError(task, error, options = {}) {
    const recoveryId = uuidv4();

    // Record failure
    this.recordFailure(task, error);

    // Check if already recovering this task
    if (this.recoveryInProgress.has(task.id)) {
      // console.log(`[ErrorRecovery] Recovery already in progress for task ${task.id}`);
      return null;
    }

    this.recoveryInProgress.add(task.id);
    this.stats.recoveriesAttempted++;

    try {
      // Determine recovery strategy
      const strategy = options.strategy || this.determineStrategy(task, error);

      // console.log(`[ErrorRecovery] Attempting ${strategy} recovery for task ${task.id}`);

      // Get recovery handler
      const handler = this.recoveryStrategies.get(strategy);
      if (!handler) {
        throw new Error(`Unknown recovery strategy: ${strategy}`);
      }

      // Get latest checkpoint if needed
      const checkpoint = await this.getLatestCheckpoint(task.id);

      // Execute recovery strategy
      const context = {
        task,
        error,
        checkpoint,
        ...options
      };

      const result = await handler(context);

      if (result.success) {
        this.stats.recoveriesSucceeded++;
        this.emit('recovery:success', {
          recoveryId,
          taskId: task.id,
          strategy,
          result
        });
      } else {
        this.stats.recoveriesFailed++;
        this.emit('recovery:failed', {
          recoveryId,
          taskId: task.id,
          strategy,
          reason: result.reason
        });
      }

      return result;

    } catch (recoveryError) {
      console.error(`[ErrorRecovery] Recovery failed for task ${task.id}:`, recoveryError);
      this.stats.recoveriesFailed++;

      this.emit('recovery:error', {
        recoveryId,
        taskId: task.id,
        error: recoveryError
      });

      return null;

    } finally {
      this.recoveryInProgress.delete(task.id);
    }
  }

  /**
   * Determine the best recovery strategy based on error type
   */
  determineStrategy(task, error) {
    // Network errors -> retry
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return 'retry';
    }

    // Process crashes -> restart
    if (error.message && error.message.includes('Process exited')) {
      return 'restart';
    }

    // State corruption -> rollback if checkpoint exists
    if (this.checkpoints.has(task.id)) {
      return 'rollback';
    }

    // Default to retry
    return 'retry';
  }

  /**
   * Record a failure for analysis
   */
  recordFailure(task, error) {
    const failure = {
      taskId: task.id,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      timestamp: new Date().toISOString(),
      taskState: task.state
    };

    this.failureHistory.push(failure);

    // Keep only recent failures
    if (this.failureHistory.length > 1000) {
      this.failureHistory.shift();
    }

    this.emit('failure:recorded', failure);
  }

  /**
   * Get failure statistics
   */
  getFailureStats() {
    const stats = {
      total: this.failureHistory.length,
      byError: {},
      byTask: {},
      recentFailures: []
    };

    // Analyze failures
    for (const failure of this.failureHistory) {
      // By error type
      const errorType = failure.error.code || 'UNKNOWN';
      stats.byError[errorType] = (stats.byError[errorType] || 0) + 1;

      // By task
      stats.byTask[failure.taskId] = (stats.byTask[failure.taskId] || 0) + 1;
    }

    // Get recent failures
    stats.recentFailures = this.failureHistory.slice(-10);

    return stats;
  }

  /**
   * Serialize state for checkpointing
   */
  serializeState(state) {
    try {
      return JSON.stringify(state, (key, value) => {
        // Handle special types
        if (value instanceof Date) {
          return { __type: 'Date', value: value.toISOString() };
        }
        if (value instanceof Map) {
          return { __type: 'Map', value: Array.from(value.entries()) };
        }
        if (value instanceof Set) {
          return { __type: 'Set', value: Array.from(value) };
        }
        return value;
      });
    } catch (error) {
      console.error('[ErrorRecovery] Failed to serialize state:', error);
      return '{}';
    }
  }

  /**
   * Deserialize state from checkpoint
   */
  deserializeState(serialized) {
    try {
      return JSON.parse(serialized, (key, value) => {
        if (value && value.__type) {
          switch (value.__type) {
            case 'Date':
              return new Date(value.value);
            case 'Map':
              return new Map(value.value);
            case 'Set':
              return new Set(value.value);
          }
        }
        return value;
      });
    } catch (error) {
      console.error('[ErrorRecovery] Failed to deserialize state:', error);
      return {};
    }
  }

  /**
   * Save checkpoint to file
   */
  async saveCheckpointFile(checkpoint) {
    const filePath = path.join(this.checkpointDir, `${checkpoint.id}.json`);
    try {
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
    } catch (error) {
      console.error('[ErrorRecovery] Failed to save checkpoint file:', error);
    }
  }

  /**
   * Delete checkpoint file
   */
  async deleteCheckpointFile(checkpointId) {
    const filePath = path.join(this.checkpointDir, `${checkpointId}.json`);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Load checkpoints from disk
   */
  async loadCheckpoints() {
    try {
      const files = await fs.readdir(this.checkpointDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.checkpointDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const checkpoint = JSON.parse(content);

        if (!this.checkpoints.has(checkpoint.taskId)) {
          this.checkpoints.set(checkpoint.taskId, []);
        }

        this.checkpoints.get(checkpoint.taskId).push(checkpoint);
      }

      // Sort checkpoints by creation date
      for (const taskCheckpoints of this.checkpoints.values()) {
        taskCheckpoints.sort((a, b) =>
          new Date(a.createdAt) - new Date(b.createdAt)
        );
      }

    } catch (error) {
      console.error('[ErrorRecovery] Failed to load checkpoints:', error);
    }
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(async () => {
      await this.cleanupOldCheckpoints();
    }, this.cleanupInterval);
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints() {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days old

    for (const [taskId, taskCheckpoints] of this.checkpoints.entries()) {
      const toRemove = [];

      for (const checkpoint of taskCheckpoints) {
        if (new Date(checkpoint.createdAt) < cutoffDate) {
          toRemove.push(checkpoint);
          await this.deleteCheckpointFile(checkpoint.id);
        }
      }

      // Remove from memory
      for (const checkpoint of toRemove) {
        const index = taskCheckpoints.indexOf(checkpoint);
        if (index !== -1) {
          taskCheckpoints.splice(index, 1);
        }
      }

      // Remove empty task entries
      if (taskCheckpoints.length === 0) {
        this.checkpoints.delete(taskId);
      }
    }

    // console.log('[ErrorRecovery] Cleaned up old checkpoints');
  }

  /**
   * Clear all checkpoints
   */
  async clearCheckpoints() {
    // Delete all files
    for (const taskCheckpoints of this.checkpoints.values()) {
      for (const checkpoint of taskCheckpoints) {
        await this.deleteCheckpointFile(checkpoint.id);
      }
    }

    // Clear memory
    this.checkpoints.clear();

    // console.log('[ErrorRecovery] Cleared all checkpoints');
  }

  /**
   * Get recovery statistics
   */
  getStats() {
    return {
      ...this.stats,
      checkpointsInMemory: Array.from(this.checkpoints.values())
        .reduce((sum, cp) => sum + cp.length, 0),
      tasksWithCheckpoints: this.checkpoints.size,
      recoveriesInProgress: this.recoveryInProgress.size,
      failureHistorySize: this.failureHistory.length
    };
  }

  /**
   * Utility: delay function
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown the error recovery system
   */
  async shutdown() {
    // console.log('[ErrorRecovery] Shutting down...');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Clear in-progress recoveries
    this.recoveryInProgress.clear();

    // console.log('[ErrorRecovery] Shutdown complete');
  }
}

module.exports = ErrorRecovery;