/**
 * Base Provider implementation
 * @module projects/providers/BaseProvider
 */

const { IProvider } = require('../core/interfaces');

/**
 * Base implementation of a Provider
 */
class BaseProvider extends IProvider {
  constructor(name = 'unnamed-provider', type = 'generic') {
    super();

    this.name = name;
    this.type = type;
    this.config = {};
    this.healthy = false;
    this.initialized = false;
    this.lastHealthCheck = null;
  }

  /**
   * Initialize the provider
   * @param {Object} config - Provider configuration
   * @returns {Promise<void>}
   */
  async initialize(config = {}) {
    console.log(`[Provider: ${this.name}] Initializing...`);

    this.config = { ...this.config, ...config };

    try {
      // Perform initialization
      await this.onInitialize();

      // Check health after initialization
      this.healthy = await this.checkHealth();
      this.initialized = true;

      console.log(`[Provider: ${this.name}] Initialized successfully`);
    } catch (error) {
      console.error(`[Provider: ${this.name}] Initialization failed:`, error);
      this.healthy = false;
      throw error;
    }
  }

  /**
   * Override this method in subclasses
   */
  async onInitialize() {
    // Implement initialization logic in subclass
  }

  /**
   * Check provider health
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    console.log(`[Provider: ${this.name}] Checking health...`);

    try {
      const isHealthy = await this.onHealthCheck();
      this.healthy = isHealthy;
      this.lastHealthCheck = new Date().toISOString();

      console.log(`[Provider: ${this.name}] Health check: ${isHealthy ? 'OK' : 'FAILED'}`);
      return isHealthy;
    } catch (error) {
      console.error(`[Provider: ${this.name}] Health check error:`, error);
      this.healthy = false;
      return false;
    }
  }

  /**
   * Override this method in subclasses
   * @returns {Promise<boolean>}
   */
  async onHealthCheck() {
    // Implement health check logic in subclass
    return true;
  }

  /**
   * Execute provider action
   * @param {string} action - Action to execute
   * @param {Object} params - Action parameters
   * @returns {Promise<any>}
   */
  async execute(action, params = {}) {
    if (!this.initialized) {
      throw new Error(`Provider ${this.name} not initialized`);
    }

    if (!this.healthy) {
      console.warn(`[Provider: ${this.name}] Unhealthy, attempting to recover...`);
      await this.checkHealth();

      if (!this.healthy) {
        throw new Error(`Provider ${this.name} is unhealthy`);
      }
    }

    console.log(`[Provider: ${this.name}] Executing action: ${action}`);

    try {
      const result = await this.onExecute(action, params);
      console.log(`[Provider: ${this.name}] Action ${action} completed`);
      return result;
    } catch (error) {
      console.error(`[Provider: ${this.name}] Action ${action} failed:`, error);
      throw error;
    }
  }

  /**
   * Override this method in subclasses
   * @param {string} action - Action to execute
   * @param {Object} params - Action parameters
   * @returns {Promise<any>}
   */
  async onExecute(action, params) {
    throw new Error(`Action '${action}' not implemented`);
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log(`[Provider: ${this.name}] Cleaning up...`);

    try {
      await this.onCleanup();
      this.initialized = false;
      this.healthy = false;

      console.log(`[Provider: ${this.name}] Cleanup completed`);
    } catch (error) {
      console.error(`[Provider: ${this.name}] Cleanup error:`, error);
    }
  }

  /**
   * Override this method in subclasses
   */
  async onCleanup() {
    // Implement cleanup logic in subclass
  }

  /**
   * Get provider status
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      type: this.type,
      healthy: this.healthy,
      initialized: this.initialized,
      lastHealthCheck: this.lastHealthCheck,
      config: this.getPublicConfig()
    };
  }

  /**
   * Get public configuration (without sensitive data)
   * @returns {Object}
   */
  getPublicConfig() {
    // Override in subclass to filter sensitive data
    return {
      ...this.config,
      // Remove sensitive fields
      password: undefined,
      apiKey: undefined,
      secret: undefined
    };
  }

  /**
   * Retry helper for provider actions
   * @param {Function} fn - Function to retry
   * @param {number} maxAttempts - Maximum retry attempts
   * @param {number} delay - Delay between attempts
   */
  async retry(fn, maxAttempts = 3, delay = 1000) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          console.log(`[Provider: ${this.name}] Retrying (attempt ${attempt + 1}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }

    throw lastError;
  }
}

module.exports = BaseProvider;