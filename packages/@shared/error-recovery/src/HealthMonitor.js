const EventEmitter = require('eventemitter3');
const { spawn } = require('child_process');
const axios = require('axios');

/**
 * Health Monitor System
 * Monitors device and service health, detects issues, and triggers alerts
 */
class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.timeout = options.timeout || 5000; // 5 seconds timeout for checks
    this.retryThreshold = options.retryThreshold || 3; // Failures before marking unhealthy
    this.recoveryThreshold = options.recoveryThreshold || 2; // Successes before marking healthy

    // Monitored components
    this.components = new Map();
    this.checkTimers = new Map();

    // Alert thresholds
    this.alertThresholds = {
      cpu: options.cpuThreshold || 80,
      memory: options.memoryThreshold || 90,
      disk: options.diskThreshold || 90,
      responseTime: options.responseTimeThreshold || 5000
    };

    // Statistics
    this.stats = {
      checksPerformed: 0,
      checksFailed: 0,
      alertsTriggered: 0,
      componentsHealthy: 0,
      componentsUnhealthy: 0
    };
  }

  /**
   * Register a device for monitoring
   */
  registerDevice(deviceId, config = {}) {
    const component = {
      id: deviceId,
      type: 'device',
      name: config.name || deviceId,
      checks: {
        connection: true,
        appium: config.appiumPort ? true : false,
        wda: config.wdaPort ? true : false
      },
      config,
      status: 'unknown',
      lastCheck: null,
      failureCount: 0,
      successCount: 0,
      metrics: {}
    };

    this.components.set(deviceId, component);
    this.startMonitoring(deviceId);

    console.log(`[HealthMonitor] Registered device: ${deviceId}`);
  }

  /**
   * Register a service for monitoring
   */
  registerService(serviceId, config) {
    const component = {
      id: serviceId,
      type: 'service',
      name: config.name || serviceId,
      checks: config.checks || {},
      config,
      status: 'unknown',
      lastCheck: null,
      failureCount: 0,
      successCount: 0,
      metrics: {}
    };

    this.components.set(serviceId, component);
    this.startMonitoring(serviceId);

    console.log(`[HealthMonitor] Registered service: ${serviceId}`);
  }

  /**
   * Start monitoring a component
   */
  startMonitoring(componentId) {
    // Stop existing timer if any
    this.stopMonitoring(componentId);

    // Start health check timer
    const timer = setInterval(() => {
      this.performHealthCheck(componentId);
    }, this.checkInterval);

    this.checkTimers.set(componentId, timer);

    // Perform initial check
    this.performHealthCheck(componentId);
  }

  /**
   * Stop monitoring a component
   */
  stopMonitoring(componentId) {
    const timer = this.checkTimers.get(componentId);
    if (timer) {
      clearInterval(timer);
      this.checkTimers.delete(componentId);
    }
  }

  /**
   * Perform health check on a component
   */
  async performHealthCheck(componentId) {
    const component = this.components.get(componentId);
    if (!component) return;

    this.stats.checksPerformed++;

    const checkResults = {
      healthy: true,
      checks: {},
      metrics: {}
    };

    try {
      if (component.type === 'device') {
        // Device-specific health checks
        checkResults.checks = await this.checkDevice(component);
        checkResults.metrics = await this.getDeviceMetrics(component);
      } else if (component.type === 'service') {
        // Service-specific health checks
        checkResults.checks = await this.checkService(component);
        checkResults.metrics = await this.getServiceMetrics(component);
      }

      // Determine overall health
      checkResults.healthy = Object.values(checkResults.checks).every(check => check.status === 'healthy');

      // Update component status
      this.updateComponentStatus(component, checkResults);

      // Check for alerts
      this.checkAlertThresholds(component, checkResults.metrics);

    } catch (error) {
      console.error(`[HealthMonitor] Health check failed for ${componentId}:`, error);
      this.stats.checksFailed++;

      component.failureCount++;
      if (component.failureCount >= this.retryThreshold) {
        this.markUnhealthy(component, error.message);
      }
    }
  }

  /**
   * Check device health
   */
  async checkDevice(component) {
    const checks = {};

    // Check device connection
    if (component.checks.connection) {
      checks.connection = await this.checkDeviceConnection(component.id);
    }

    // Check Appium server
    if (component.checks.appium && component.config.appiumPort) {
      checks.appium = await this.checkAppiumServer(component.config.appiumPort);
    }

    // Check WebDriverAgent
    if (component.checks.wda && component.config.wdaPort) {
      checks.wda = await this.checkWebDriverAgent(component.config.wdaPort);
    }

    return checks;
  }

  /**
   * Check service health
   */
  async checkService(component) {
    const checks = {};

    // HTTP endpoint check
    if (component.checks.http) {
      checks.http = await this.checkHttpEndpoint(component.config.url);
    }

    // Port check
    if (component.checks.port) {
      checks.port = await this.checkPort(component.config.host, component.config.port);
    }

    // Process check
    if (component.checks.process) {
      checks.process = await this.checkProcess(component.config.processName);
    }

    return checks;
  }

  /**
   * Check device connection using idevice_id
   */
  async checkDeviceConnection(deviceId) {
    return new Promise((resolve) => {
      const proc = spawn('/opt/homebrew/bin/idevice_id', ['-l']);
      let output = '';

      const timeout = setTimeout(() => {
        proc.kill();
        resolve({ status: 'unhealthy', reason: 'Timeout' });
      }, this.timeout);

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0 && output.includes(deviceId)) {
          resolve({ status: 'healthy' });
        } else {
          resolve({ status: 'unhealthy', reason: 'Device not found' });
        }
      });
    });
  }

  /**
   * Check Appium server status
   */
  async checkAppiumServer(port) {
    try {
      const response = await axios.get(`http://127.0.0.1:${port}/status`, {
        timeout: this.timeout
      });

      if (response.data && response.data.value) {
        return { status: 'healthy', data: response.data.value };
      } else {
        return { status: 'unhealthy', reason: 'Invalid response' };
      }
    } catch (error) {
      return { status: 'unhealthy', reason: error.message };
    }
  }

  /**
   * Check WebDriverAgent status
   */
  async checkWebDriverAgent(port) {
    try {
      const response = await axios.get(`http://127.0.0.1:${port}/status`, {
        timeout: this.timeout
      });

      if (response.data && response.data.value) {
        return { status: 'healthy', data: response.data.value };
      } else {
        return { status: 'unhealthy', reason: 'Invalid response' };
      }
    } catch (error) {
      return { status: 'unhealthy', reason: error.message };
    }
  }

  /**
   * Check HTTP endpoint
   */
  async checkHttpEndpoint(url) {
    try {
      const start = Date.now();
      const response = await axios.get(url, {
        timeout: this.timeout
      });

      const responseTime = Date.now() - start;

      if (response.status >= 200 && response.status < 300) {
        return { status: 'healthy', responseTime };
      } else {
        return { status: 'unhealthy', reason: `HTTP ${response.status}` };
      }
    } catch (error) {
      return { status: 'unhealthy', reason: error.message };
    }
  }

  /**
   * Check if a port is open
   */
  async checkPort(host, port) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();

      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({ status: 'unhealthy', reason: 'Timeout' });
      }, this.timeout);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve({ status: 'healthy' });
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        resolve({ status: 'unhealthy', reason: error.message });
      });

      socket.connect(port, host);
    });
  }

  /**
   * Check if a process is running
   */
  async checkProcess(processName) {
    return new Promise((resolve) => {
      const proc = spawn('ps', ['aux']);
      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', () => {
        if (output.includes(processName)) {
          resolve({ status: 'healthy' });
        } else {
          resolve({ status: 'unhealthy', reason: 'Process not found' });
        }
      });
    });
  }

  /**
   * Get device metrics
   */
  async getDeviceMetrics(component) {
    const metrics = {};

    // Get iOS device info if available
    try {
      const proc = spawn('/opt/homebrew/bin/ideviceinfo', [
        '-u', component.id,
        '-k', 'BatteryCurrentCapacity'
      ]);

      await new Promise((resolve) => {
        let output = '';

        proc.stdout.on('data', (data) => {
          output += data.toString();
        });

        proc.on('close', () => {
          const battery = parseInt(output.trim());
          if (!isNaN(battery)) {
            metrics.battery = battery;
          }
          resolve();
        });
      });
    } catch (error) {
      // Ignore errors
    }

    return metrics;
  }

  /**
   * Get service metrics
   */
  async getServiceMetrics(component) {
    const metrics = {};

    // Get process metrics if PID is available
    if (component.config.pid) {
      try {
        const pidusage = require('pidusage');
        const stats = await pidusage(component.config.pid);

        metrics.cpu = stats.cpu;
        metrics.memory = stats.memory / 1024 / 1024; // Convert to MB
        metrics.uptime = stats.elapsed;
      } catch (error) {
        // Process might have exited
      }
    }

    return metrics;
  }

  /**
   * Update component status based on health check results
   */
  updateComponentStatus(component, checkResults) {
    const previousStatus = component.status;
    component.lastCheck = new Date();
    component.metrics = checkResults.metrics;

    if (checkResults.healthy) {
      component.failureCount = 0;
      component.successCount++;

      if (component.successCount >= this.recoveryThreshold) {
        component.status = 'healthy';
        this.stats.componentsHealthy++;

        if (previousStatus === 'unhealthy') {
          this.stats.componentsUnhealthy--;
          this.emit('component:recovered', {
            id: component.id,
            name: component.name,
            type: component.type
          });
        }
      }
    } else {
      component.successCount = 0;
      component.failureCount++;

      if (component.failureCount >= this.retryThreshold) {
        this.markUnhealthy(component, 'Health checks failed');
      }
    }

    this.emit('health:checked', {
      id: component.id,
      status: component.status,
      checks: checkResults.checks,
      metrics: checkResults.metrics
    });
  }

  /**
   * Mark a component as unhealthy
   */
  markUnhealthy(component, reason) {
    const previousStatus = component.status;
    component.status = 'unhealthy';

    if (previousStatus !== 'unhealthy') {
      this.stats.componentsUnhealthy++;
      if (previousStatus === 'healthy') {
        this.stats.componentsHealthy--;
      }

      this.emit('component:unhealthy', {
        id: component.id,
        name: component.name,
        type: component.type,
        reason
      });

      // Trigger alert
      this.triggerAlert({
        severity: 'high',
        component: component.id,
        message: `${component.name} is unhealthy: ${reason}`
      });
    }
  }

  /**
   * Check metrics against alert thresholds
   */
  checkAlertThresholds(component, metrics) {
    // Check CPU usage
    if (metrics.cpu && metrics.cpu > this.alertThresholds.cpu) {
      this.triggerAlert({
        severity: 'warning',
        component: component.id,
        metric: 'cpu',
        value: metrics.cpu,
        threshold: this.alertThresholds.cpu,
        message: `High CPU usage: ${metrics.cpu.toFixed(1)}%`
      });
    }

    // Check memory usage
    if (metrics.memory && metrics.memory > this.alertThresholds.memory) {
      this.triggerAlert({
        severity: 'warning',
        component: component.id,
        metric: 'memory',
        value: metrics.memory,
        threshold: this.alertThresholds.memory,
        message: `High memory usage: ${metrics.memory.toFixed(1)}MB`
      });
    }

    // Check battery level (for devices)
    if (metrics.battery && metrics.battery < 20) {
      this.triggerAlert({
        severity: 'warning',
        component: component.id,
        metric: 'battery',
        value: metrics.battery,
        message: `Low battery: ${metrics.battery}%`
      });
    }
  }

  /**
   * Trigger an alert
   */
  triggerAlert(alert) {
    alert.timestamp = new Date();
    this.stats.alertsTriggered++;

    this.emit('alert:triggered', alert);

    console.log(`[HealthMonitor] Alert: ${alert.message}`);
  }

  /**
   * Get health status of all components
   */
  getHealthStatus() {
    const status = {
      overall: 'healthy',
      components: [],
      stats: this.stats
    };

    for (const component of this.components.values()) {
      status.components.push({
        id: component.id,
        name: component.name,
        type: component.type,
        status: component.status,
        lastCheck: component.lastCheck,
        metrics: component.metrics
      });

      if (component.status === 'unhealthy') {
        status.overall = 'unhealthy';
      }
    }

    return status;
  }

  /**
   * Get component health history
   */
  getComponentHealth(componentId) {
    const component = this.components.get(componentId);
    if (!component) return null;

    return {
      id: component.id,
      name: component.name,
      type: component.type,
      status: component.status,
      lastCheck: component.lastCheck,
      failureCount: component.failureCount,
      successCount: component.successCount,
      metrics: component.metrics
    };
  }

  /**
   * Force health check on a component
   */
  async forceCheck(componentId) {
    await this.performHealthCheck(componentId);
  }

  /**
   * Force health check on all components
   */
  async forceCheckAll() {
    const promises = [];
    for (const componentId of this.components.keys()) {
      promises.push(this.performHealthCheck(componentId));
    }
    await Promise.all(promises);
  }

  /**
   * Shutdown the health monitor
   */
  async shutdown() {
    console.log('[HealthMonitor] Shutting down...');

    // Stop all monitoring
    for (const componentId of this.checkTimers.keys()) {
      this.stopMonitoring(componentId);
    }

    // Clear components
    this.components.clear();

    console.log('[HealthMonitor] Shutdown complete');
  }
}

module.exports = HealthMonitor;