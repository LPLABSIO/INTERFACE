/**
 * Core interfaces for the Project System
 * @module projects/core/interfaces
 */

/**
 * Interface for all projects
 * @interface IProject
 */
class IProject {
  constructor() {
    if (new.target === IProject) {
      throw new TypeError('Cannot instantiate interface IProject');
    }

    // Required properties
    this.name = '';
    this.version = '';
    this.flows = new Map();
    this.providers = new Map();
    this.config = {};
  }

  /**
   * Initialize the project
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Method initialize() must be implemented');
  }

  /**
   * Execute the project workflow
   * @param {Object} context - Execution context
   * @returns {Promise<ProjectResult>}
   */
  async execute(context = {}) {
    throw new Error('Method execute() must be implemented');
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    throw new Error('Method cleanup() must be implemented');
  }

  /**
   * Validate project configuration
   * @returns {Promise<boolean>}
   */
  async validate() {
    throw new Error('Method validate() must be implemented');
  }

  /**
   * Get project metadata
   * @returns {Object}
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      flows: Array.from(this.flows.keys()),
      providers: Array.from(this.providers.keys())
    };
  }
}

/**
 * Interface for all flows
 * @interface IFlow
 */
class IFlow {
  constructor() {
    if (new.target === IFlow) {
      throw new TypeError('Cannot instantiate interface IFlow');
    }

    this.name = '';
    this.steps = [];
    this.errorBoundary = null;
  }

  /**
   * Execute the flow
   * @param {Object} context - Execution context
   * @returns {Promise<FlowResult>}
   */
  async execute(context = {}) {
    throw new Error('Method execute() must be implemented');
  }

  /**
   * Add a step to the flow
   * @param {IStep} step
   */
  addStep(step) {
    throw new Error('Method addStep() must be implemented');
  }

  /**
   * Set error boundary
   * @param {Function} handler
   */
  setErrorBoundary(handler) {
    this.errorBoundary = handler;
  }
}

/**
 * Interface for all providers
 * @interface IProvider
 */
class IProvider {
  constructor() {
    if (new.target === IProvider) {
      throw new TypeError('Cannot instantiate interface IProvider');
    }

    this.name = '';
    this.type = '';
    this.config = {};
    this.healthy = false;
  }

  /**
   * Initialize the provider
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error('Method initialize() must be implemented');
  }

  /**
   * Check provider health
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    throw new Error('Method checkHealth() must be implemented');
  }

  /**
   * Execute provider action
   * @param {string} action - Action to execute
   * @param {Object} params - Action parameters
   * @returns {Promise<any>}
   */
  async execute(action, params = {}) {
    throw new Error('Method execute() must be implemented');
  }

  /**
   * Clean up resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    throw new Error('Method cleanup() must be implemented');
  }

  /**
   * Get provider status
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.name,
      type: this.type,
      healthy: this.healthy
    };
  }
}

/**
 * Result structure for project execution
 */
class ProjectResult {
  constructor(success = false, data = null, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
    this.executionTime = 0;
    this.flows = [];
  }
}

/**
 * Result structure for flow execution
 */
class FlowResult {
  constructor(success = false, data = null, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.timestamp = new Date().toISOString();
    this.steps = [];
  }
}

module.exports = {
  IProject,
  IFlow,
  IProvider,
  ProjectResult,
  FlowResult
};