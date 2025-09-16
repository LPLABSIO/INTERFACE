const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('eventemitter3');

/**
 * Priority levels for tasks
 */
const TaskPriority = {
  CRITICAL: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1
};

/**
 * Task states
 */
const TaskState = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};

/**
 * Task queue with priority support
 * Manages task lifecycle and priority-based ordering
 */
class TaskQueue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxQueueSize = options.maxQueueSize || 1000;
    this.defaultPriority = options.defaultPriority || TaskPriority.NORMAL;

    // Priority queues - higher priority = higher index
    this.queues = {
      [TaskPriority.CRITICAL]: [],
      [TaskPriority.HIGH]: [],
      [TaskPriority.NORMAL]: [],
      [TaskPriority.LOW]: []
    };

    // Task registry for quick lookup
    this.tasks = new Map();

    // Statistics
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalCancelled: 0,
      averageWaitTime: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Enqueue a new task
   * @param {Object} taskData - Task data
   * @param {Object} options - Task options
   * @returns {Object} Created task
   */
  enqueue(taskData, options = {}) {
    // Check queue size limit
    if (this.getQueueSize() >= this.maxQueueSize) {
      throw new Error('Queue size limit exceeded');
    }

    const task = {
      id: options.id || uuidv4(),
      type: taskData.type || 'default',
      data: taskData,
      priority: options.priority || this.defaultPriority,
      state: TaskState.PENDING,
      retries: 0,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 60000,
      dependencies: options.dependencies || [],
      metadata: options.metadata || {},
      createdAt: new Date(),
      assignedAt: null,
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
      deviceId: null,
      sessionId: null
    };

    // Add to appropriate priority queue
    this.queues[task.priority].push(task);
    this.tasks.set(task.id, task);

    this.stats.totalEnqueued++;

    this.emit('task:enqueued', task);

    return task;
  }

  /**
   * Dequeue the next highest priority task
   * @param {Object} criteria - Optional criteria for task selection
   * @returns {Object|null} Next task or null if queue is empty
   */
  dequeue(criteria = {}) {
    // Check priorities from highest to lowest
    const priorities = [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.NORMAL,
      TaskPriority.LOW
    ];

    for (const priority of priorities) {
      const queue = this.queues[priority];

      if (queue.length === 0) continue;

      // Find task matching criteria
      let taskIndex = 0;
      if (criteria.type || criteria.deviceId) {
        taskIndex = queue.findIndex(task => {
          if (criteria.type && task.type !== criteria.type) return false;
          if (criteria.deviceId && task.deviceId && task.deviceId !== criteria.deviceId) return false;
          return true;
        });

        if (taskIndex === -1) continue;
      }

      // Remove and return task
      const task = queue.splice(taskIndex, 1)[0];

      // Update task state
      task.state = TaskState.ASSIGNED;
      task.assignedAt = new Date();

      // Update wait time statistics
      const waitTime = task.assignedAt - task.createdAt;
      this.updateAverageWaitTime(waitTime);

      this.emit('task:dequeued', task);

      return task;
    }

    return null;
  }

  /**
   * Peek at the next task without removing it
   * @returns {Object|null} Next task or null
   */
  peek() {
    const priorities = [
      TaskPriority.CRITICAL,
      TaskPriority.HIGH,
      TaskPriority.NORMAL,
      TaskPriority.LOW
    ];

    for (const priority of priorities) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        return queue[0];
      }
    }

    return null;
  }

  /**
   * Update task state
   * @param {string} taskId - Task ID
   * @param {string} state - New state
   * @param {Object} updates - Additional updates
   */
  updateTaskState(taskId, state, updates = {}) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const oldState = task.state;
    task.state = state;

    // Apply additional updates
    Object.assign(task, updates);

    // Update timestamps based on state
    switch (state) {
      case TaskState.RUNNING:
        task.startedAt = new Date();
        break;
      case TaskState.COMPLETED:
        task.completedAt = new Date();
        if (task.startedAt) {
          const processingTime = task.completedAt - task.startedAt;
          this.updateAverageProcessingTime(processingTime);
        }
        this.stats.totalProcessed++;
        break;
      case TaskState.FAILED:
        task.completedAt = new Date();
        this.stats.totalFailed++;
        break;
      case TaskState.CANCELLED:
        task.completedAt = new Date();
        this.stats.totalCancelled++;
        break;
    }

    this.emit('task:state-changed', { task, oldState, newState: state });
  }

  /**
   * Mark task as completed
   * @param {string} taskId - Task ID
   * @param {any} result - Task result
   */
  complete(taskId, result) {
    this.updateTaskState(taskId, TaskState.COMPLETED, { result });
  }

  /**
   * Mark task as failed
   * @param {string} taskId - Task ID
   * @param {Error} error - Error that caused failure
   */
  fail(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.error = error.message || error;

    // Check if should retry
    if (task.retries < task.maxRetries) {
      task.retries++;
      this.updateTaskState(taskId, TaskState.RETRYING);

      // Re-enqueue with same priority
      task.state = TaskState.PENDING;
      task.assignedAt = null;
      task.startedAt = null;
      this.queues[task.priority].push(task);

      this.emit('task:retry', task);
    } else {
      this.updateTaskState(taskId, TaskState.FAILED, { error: task.error });
    }
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   */
  cancel(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Remove from queue if pending
    if (task.state === TaskState.PENDING) {
      const queue = this.queues[task.priority];
      const index = queue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }

    this.updateTaskState(taskId, TaskState.CANCELLED);
  }

  /**
   * Get all tasks matching criteria
   * @param {Object} criteria - Filter criteria
   * @returns {Array} Matching tasks
   */
  getTasks(criteria = {}) {
    let tasks = Array.from(this.tasks.values());

    if (criteria.state) {
      tasks = tasks.filter(t => t.state === criteria.state);
    }

    if (criteria.type) {
      tasks = tasks.filter(t => t.type === criteria.type);
    }

    if (criteria.priority) {
      tasks = tasks.filter(t => t.priority === criteria.priority);
    }

    if (criteria.deviceId) {
      tasks = tasks.filter(t => t.deviceId === criteria.deviceId);
    }

    return tasks;
  }

  /**
   * Get queue size
   * @param {number} priority - Optional specific priority
   * @returns {number} Queue size
   */
  getQueueSize(priority = null) {
    if (priority !== null) {
      return this.queues[priority]?.length || 0;
    }

    return Object.values(this.queues).reduce((sum, queue) => sum + queue.length, 0);
  }

  /**
   * Clear all tasks
   * @param {Object} criteria - Optional criteria for selective clearing
   */
  clear(criteria = {}) {
    if (Object.keys(criteria).length === 0) {
      // Clear everything
      Object.keys(this.queues).forEach(priority => {
        this.queues[priority] = [];
      });
      this.tasks.clear();
      this.emit('queue:cleared');
    } else {
      // Clear matching tasks
      const tasksToRemove = this.getTasks(criteria);
      tasksToRemove.forEach(task => {
        this.cancel(task.id);
        this.tasks.delete(task.id);
      });
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      queueSizes: {
        critical: this.getQueueSize(TaskPriority.CRITICAL),
        high: this.getQueueSize(TaskPriority.HIGH),
        normal: this.getQueueSize(TaskPriority.NORMAL),
        low: this.getQueueSize(TaskPriority.LOW),
        total: this.getQueueSize()
      },
      taskStates: {
        pending: this.getTasks({ state: TaskState.PENDING }).length,
        assigned: this.getTasks({ state: TaskState.ASSIGNED }).length,
        running: this.getTasks({ state: TaskState.RUNNING }).length,
        completed: this.getTasks({ state: TaskState.COMPLETED }).length,
        failed: this.getTasks({ state: TaskState.FAILED }).length,
        cancelled: this.getTasks({ state: TaskState.CANCELLED }).length
      }
    };
  }

  /**
   * Update average wait time
   * @private
   */
  updateAverageWaitTime(waitTime) {
    const count = this.stats.totalEnqueued;
    this.stats.averageWaitTime =
      (this.stats.averageWaitTime * (count - 1) + waitTime) / count;
  }

  /**
   * Update average processing time
   * @private
   */
  updateAverageProcessingTime(processingTime) {
    const count = this.stats.totalProcessed;
    if (count === 0) {
      this.stats.averageProcessingTime = processingTime;
    } else {
      this.stats.averageProcessingTime =
        (this.stats.averageProcessingTime * (count - 1) + processingTime) / count;
    }
  }

  /**
   * Get estimated wait time for a new task
   * @param {number} priority - Task priority
   * @returns {number} Estimated wait time in milliseconds
   */
  getEstimatedWaitTime(priority = TaskPriority.NORMAL) {
    let tasksAhead = 0;

    // Count all higher priority tasks
    const priorities = [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW];
    for (const p of priorities) {
      if (p >= priority) {
        tasksAhead += this.getQueueSize(p);
      }
      if (p === priority) break;
    }

    // Estimate based on average processing time
    return tasksAhead * this.stats.averageProcessingTime;
  }
}

module.exports = {
  TaskQueue,
  TaskPriority,
  TaskState
};