const EventEmitter = require('eventemitter3');
const { TaskQueue, TaskPriority, TaskState } = require('./TaskQueue');
const { v4: uuidv4 } = require('uuid');

/**
 * Queue Manager orchestrates task distribution across multiple devices
 * Handles task scheduling, device allocation, and load balancing
 */
class QueueManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.maxConcurrentTasks = options.maxConcurrentTasks || 10;
    this.taskTimeout = options.taskTimeout || 300000; // 5 minutes default
    this.allocationStrategy = options.allocationStrategy || 'round-robin';
    this.enableDeadLetterQueue = options.enableDeadLetterQueue !== false;

    // Main task queue
    this.taskQueue = new TaskQueue({
      maxQueueSize: options.maxQueueSize || 1000,
      defaultPriority: options.defaultPriority || TaskPriority.NORMAL
    });

    // Dead letter queue for failed tasks
    if (this.enableDeadLetterQueue) {
      this.deadLetterQueue = new TaskQueue({
        maxQueueSize: 100,
        defaultPriority: TaskPriority.LOW
      });
    }

    // Device registry
    this.devices = new Map();
    this.deviceRoundRobinIndex = 0;

    // Active tasks tracking
    this.activeTasks = new Map();
    this.taskTimers = new Map();

    // Schedulers
    this.schedulers = new Map();
    this.processingInterval = null;

    // Statistics
    this.stats = {
      tasksScheduled: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageQueueTime: 0,
      averageExecutionTime: 0,
      deviceUtilization: {}
    };

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Initialize the queue manager
   */
  async initialize() {
    console.log('[QueueManager] Initializing...');

    // Start processing loop
    this.startProcessing();

    console.log('[QueueManager] Initialization complete');
  }

  /**
   * Setup internal event listeners
   */
  setupEventListeners() {
    // TaskQueue events
    this.taskQueue.on('task:enqueued', (task) => {
      this.emit('task:enqueued', task);
      this.processNextTask();
    });

    this.taskQueue.on('task:state-changed', ({ task, oldState, newState }) => {
      this.emit('task:state-changed', { task, oldState, newState });
    });

    this.taskQueue.on('task:retry', (task) => {
      this.emit('task:retry', task);
    });
  }

  /**
   * Register a device for task allocation
   * @param {Object} device - Device information
   */
  registerDevice(device) {
    const deviceInfo = {
      id: device.id || device.udid,
      name: device.name,
      status: 'available',
      capabilities: device.capabilities || [],
      maxConcurrentTasks: device.maxConcurrentTasks || 1,
      currentTasks: [],
      lastAssigned: null,
      stats: {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageExecutionTime: 0
      }
    };

    this.devices.set(deviceInfo.id, deviceInfo);
    this.emit('device:registered', deviceInfo);

    console.log(`[QueueManager] Device registered: ${deviceInfo.id}`);

    // Process pending tasks
    this.processNextTask();
  }

  /**
   * Unregister a device
   * @param {string} deviceId - Device ID
   */
  unregisterDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Cancel active tasks on this device
    device.currentTasks.forEach(taskId => {
      this.taskQueue.cancel(taskId);
    });

    this.devices.delete(deviceId);
    this.emit('device:unregistered', deviceId);

    console.log(`[QueueManager] Device unregistered: ${deviceId}`);
  }

  /**
   * Submit a task to the queue
   * @param {Object} taskData - Task data
   * @param {Object} options - Task options
   * @returns {Object} Created task
   */
  submitTask(taskData, options = {}) {
    // Validate task
    if (!taskData.type) {
      throw new Error('Task type is required');
    }

    // Create and enqueue task
    const task = this.taskQueue.enqueue(taskData, {
      ...options,
      timeout: options.timeout || this.taskTimeout
    });

    this.stats.tasksScheduled++;

    console.log(`[QueueManager] Task submitted: ${task.id} (priority: ${task.priority})`);

    return task;
  }

  /**
   * Schedule a task for future execution
   * @param {Object} taskData - Task data
   * @param {Date|number} when - When to execute (Date or delay in ms)
   * @param {Object} options - Task options
   * @returns {string} Scheduler ID
   */
  scheduleTask(taskData, when, options = {}) {
    const schedulerId = uuidv4();
    let delay;

    if (when instanceof Date) {
      delay = when.getTime() - Date.now();
    } else {
      delay = when;
    }

    if (delay < 0) {
      throw new Error('Cannot schedule task in the past');
    }

    const timer = setTimeout(() => {
      this.submitTask(taskData, options);
      this.schedulers.delete(schedulerId);
    }, delay);

    this.schedulers.set(schedulerId, {
      id: schedulerId,
      taskData,
      scheduledFor: new Date(Date.now() + delay),
      timer
    });

    this.emit('task:scheduled', { schedulerId, scheduledFor: new Date(Date.now() + delay) });

    return schedulerId;
  }

  /**
   * Cancel a scheduled task
   * @param {string} schedulerId - Scheduler ID
   */
  cancelScheduledTask(schedulerId) {
    const scheduler = this.schedulers.get(schedulerId);
    if (scheduler) {
      clearTimeout(scheduler.timer);
      this.schedulers.delete(schedulerId);
      this.emit('task:schedule-cancelled', schedulerId);
    }
  }

  /**
   * Process the next task in queue
   */
  async processNextTask() {
    // Check if we can process more tasks
    if (this.activeTasks.size >= this.maxConcurrentTasks) {
      return;
    }

    // Find an available device
    const availableDevice = this.findAvailableDevice();
    if (!availableDevice) {
      return;
    }

    // Get next task from queue
    const task = this.taskQueue.dequeue();
    if (!task) {
      return;
    }

    // Assign task to device
    await this.assignTaskToDevice(task, availableDevice);
  }

  /**
   * Find an available device using the configured strategy
   * @returns {Object|null} Available device or null
   */
  findAvailableDevice() {
    const devices = Array.from(this.devices.values())
      .filter(d => d.status === 'available' && d.currentTasks.length < d.maxConcurrentTasks);

    if (devices.length === 0) {
      return null;
    }

    let selectedDevice;

    switch (this.allocationStrategy) {
      case 'round-robin':
        selectedDevice = devices[this.deviceRoundRobinIndex % devices.length];
        this.deviceRoundRobinIndex++;
        break;

      case 'least-loaded':
        selectedDevice = devices.reduce((min, device) =>
          device.currentTasks.length < min.currentTasks.length ? device : min
        );
        break;

      case 'random':
        selectedDevice = devices[Math.floor(Math.random() * devices.length)];
        break;

      case 'fastest':
        selectedDevice = devices.reduce((fastest, device) =>
          device.stats.averageExecutionTime < fastest.stats.averageExecutionTime ? device : fastest
        );
        break;

      default:
        selectedDevice = devices[0];
    }

    return selectedDevice;
  }

  /**
   * Assign a task to a specific device
   * @param {Object} task - Task to assign
   * @param {Object} device - Device to assign to
   */
  async assignTaskToDevice(task, device) {
    // Update task
    task.deviceId = device.id;
    task.assignedAt = new Date();
    this.taskQueue.updateTaskState(task.id, TaskState.ASSIGNED, { deviceId: device.id });

    // Update device
    device.currentTasks.push(task.id);
    device.lastAssigned = new Date();
    if (device.currentTasks.length >= device.maxConcurrentTasks) {
      device.status = 'busy';
    }

    // Track active task
    this.activeTasks.set(task.id, {
      task,
      device,
      startedAt: new Date()
    });

    // Set task timeout
    const timer = setTimeout(() => {
      this.handleTaskTimeout(task.id);
    }, task.timeout);
    this.taskTimers.set(task.id, timer);

    // Update statistics
    device.stats.totalTasks++;

    this.emit('task:assigned', { task, device });

    console.log(`[QueueManager] Task ${task.id} assigned to device ${device.id}`);

    // Execute task (delegate to orchestrator)
    this.emit('task:execute', { task, device });
  }

  /**
   * Mark task as started
   * @param {string} taskId - Task ID
   */
  startTask(taskId) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) return;

    this.taskQueue.updateTaskState(taskId, TaskState.RUNNING);
    activeTask.task.startedAt = new Date();

    this.emit('task:started', activeTask.task);
  }

  /**
   * Complete a task
   * @param {string} taskId - Task ID
   * @param {any} result - Task result
   */
  completeTask(taskId, result) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) return;

    const { task, device } = activeTask;

    // Clear timeout
    const timer = this.taskTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.taskTimers.delete(taskId);
    }

    // Update task
    this.taskQueue.complete(taskId, result);

    // Update device
    const taskIndex = device.currentTasks.indexOf(taskId);
    if (taskIndex !== -1) {
      device.currentTasks.splice(taskIndex, 1);
    }
    if (device.status === 'busy' && device.currentTasks.length < device.maxConcurrentTasks) {
      device.status = 'available';
    }

    // Update statistics
    device.stats.completedTasks++;
    this.stats.tasksCompleted++;

    const executionTime = Date.now() - activeTask.startedAt;
    this.updateAverageExecutionTime(device, executionTime);

    // Clean up
    this.activeTasks.delete(taskId);

    this.emit('task:completed', { task, result });

    console.log(`[QueueManager] Task ${taskId} completed on device ${device.id}`);

    // Process next task
    this.processNextTask();
  }

  /**
   * Fail a task
   * @param {string} taskId - Task ID
   * @param {Error} error - Error that caused failure
   */
  failTask(taskId, error) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) return;

    const { task, device } = activeTask;

    // Clear timeout
    const timer = this.taskTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.taskTimers.delete(taskId);
    }

    // Update task (will retry if retries available)
    this.taskQueue.fail(taskId, error);

    // Update device
    const taskIndex = device.currentTasks.indexOf(taskId);
    if (taskIndex !== -1) {
      device.currentTasks.splice(taskIndex, 1);
    }
    if (device.status === 'busy' && device.currentTasks.length < device.maxConcurrentTasks) {
      device.status = 'available';
    }

    // Check if task exceeded max retries
    if (task.retries >= task.maxRetries) {
      // Move to dead letter queue if enabled
      if (this.enableDeadLetterQueue) {
        this.deadLetterQueue.enqueue(task.data, {
          ...task,
          originalTaskId: task.id,
          failureReason: error.message
        });
        this.emit('task:dead-letter', task);
      }

      device.stats.failedTasks++;
      this.stats.tasksFailed++;
    }

    // Clean up
    this.activeTasks.delete(taskId);

    this.emit('task:failed', { task, error });

    console.log(`[QueueManager] Task ${taskId} failed on device ${device.id}: ${error.message}`);

    // Process next task
    this.processNextTask();
  }

  /**
   * Handle task timeout
   * @param {string} taskId - Task ID
   */
  handleTaskTimeout(taskId) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) return;

    console.log(`[QueueManager] Task ${taskId} timed out`);

    this.failTask(taskId, new Error('Task timeout'));
  }

  /**
   * Start processing loop
   */
  startProcessing() {
    if (this.processingInterval) return;

    this.processingInterval = setInterval(() => {
      this.processNextTask();
    }, 1000); // Check every second
  }

  /**
   * Stop processing loop
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Update average execution time for a device
   * @private
   */
  updateAverageExecutionTime(device, executionTime) {
    const count = device.stats.completedTasks;
    if (count === 1) {
      device.stats.averageExecutionTime = executionTime;
    } else {
      device.stats.averageExecutionTime =
        (device.stats.averageExecutionTime * (count - 1) + executionTime) / count;
    }
  }

  /**
   * Get queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    const queueStats = this.taskQueue.getStats();
    const deadLetterStats = this.deadLetterQueue?.getStats();

    // Calculate device utilization
    const deviceUtilization = {};
    this.devices.forEach((device, id) => {
      deviceUtilization[id] = {
        name: device.name,
        status: device.status,
        currentLoad: device.currentTasks.length,
        maxCapacity: device.maxConcurrentTasks,
        utilization: (device.currentTasks.length / device.maxConcurrentTasks) * 100,
        stats: device.stats
      };
    });

    return {
      queue: queueStats,
      deadLetter: deadLetterStats,
      devices: deviceUtilization,
      global: {
        ...this.stats,
        activeTasksCount: this.activeTasks.size,
        scheduledTasksCount: this.schedulers.size
      }
    };
  }

  /**
   * Get active tasks
   * @returns {Array} Active tasks
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values());
  }

  /**
   * Get scheduled tasks
   * @returns {Array} Scheduled tasks
   */
  getScheduledTasks() {
    return Array.from(this.schedulers.values()).map(s => ({
      id: s.id,
      taskData: s.taskData,
      scheduledFor: s.scheduledFor
    }));
  }

  /**
   * Clear all queues
   */
  clearAll() {
    // Cancel all active tasks
    this.activeTasks.forEach((_, taskId) => {
      this.taskQueue.cancel(taskId);
    });

    // Clear all timers
    this.taskTimers.forEach(timer => clearTimeout(timer));
    this.taskTimers.clear();

    // Cancel all scheduled tasks
    this.schedulers.forEach(scheduler => clearTimeout(scheduler.timer));
    this.schedulers.clear();

    // Clear queues
    this.taskQueue.clear();
    if (this.deadLetterQueue) {
      this.deadLetterQueue.clear();
    }

    // Reset devices
    this.devices.forEach(device => {
      device.currentTasks = [];
      device.status = 'available';
    });

    this.activeTasks.clear();

    console.log('[QueueManager] All queues cleared');
  }

  /**
   * Shutdown the queue manager
   */
  async shutdown() {
    console.log('[QueueManager] Shutting down...');

    // Stop processing
    this.stopProcessing();

    // Clear all tasks
    this.clearAll();

    // Unregister all devices
    const deviceIds = Array.from(this.devices.keys());
    deviceIds.forEach(id => this.unregisterDevice(id));

    console.log('[QueueManager] Shutdown complete');
  }
}

module.exports = QueueManager;