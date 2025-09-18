/**
 * Base Flow implementation
 * @module projects/flows/BaseFlow
 */

const { IFlow, FlowResult } = require('../core/interfaces');

/**
 * Base implementation of a Flow
 */
class BaseFlow extends IFlow {
  constructor(name = 'unnamed-flow') {
    super();

    this.name = name;
    this.steps = [];
    this.errorBoundary = null;
    this.currentStep = 0;
    this.context = {};
  }

  /**
   * Add a step to the flow
   * @param {Object} step - Step configuration
   */
  addStep(step) {
    if (!step || typeof step.execute !== 'function') {
      throw new Error('Invalid step: must have an execute function');
    }

    this.steps.push({
      id: `step_${this.steps.length + 1}`,
      name: step.name || `Step ${this.steps.length + 1}`,
      execute: step.execute,
      retry: step.retry || 0,
      timeout: step.timeout || 30000,
      skipOnError: step.skipOnError || false
    });
  }

  /**
   * Execute the flow
   * @param {Object} context - Execution context
   * @returns {Promise<FlowResult>}
   */
  async execute(context = {}) {
    console.log(`[Flow: ${this.name}] Starting execution`);

    this.context = { ...context };
    const result = new FlowResult(true, {});

    try {
      for (let i = 0; i < this.steps.length; i++) {
        this.currentStep = i;
        const step = this.steps[i];

        console.log(`[Flow: ${this.name}] Executing ${step.name}`);

        try {
          const stepResult = await this.executeStep(step);

          result.steps.push({
            id: step.id,
            name: step.name,
            success: true,
            result: stepResult
          });

          // Add step result to context for next steps
          this.context[step.id] = stepResult;
        } catch (error) {
          console.error(`[Flow: ${this.name}] Step ${step.name} failed:`, error);

          if (!step.skipOnError) {
            throw error;
          }

          result.steps.push({
            id: step.id,
            name: step.name,
            success: false,
            error: error.message
          });
        }
      }

      result.data = this.context;
      console.log(`[Flow: ${this.name}] Completed successfully`);
    } catch (error) {
      console.error(`[Flow: ${this.name}] Failed:`, error);

      if (this.errorBoundary) {
        await this.errorBoundary(error, this.context);
      }

      result.success = false;
      result.error = error.message;
    }

    return result;
  }

  /**
   * Execute a single step with retry logic
   * @param {Object} step - Step to execute
   * @returns {Promise<any>}
   */
  async executeStep(step) {
    let lastError;
    const maxAttempts = step.retry + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Execute with timeout
        const result = await this.executeWithTimeout(
          step.execute(this.context),
          step.timeout
        );

        return result;
      } catch (error) {
        lastError = error;

        if (attempt < maxAttempts) {
          console.log(`[Flow: ${this.name}] Retrying ${step.name} (attempt ${attempt + 1}/${maxAttempts})`);
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute promise with timeout
   * @param {Promise} promise - Promise to execute
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<any>}
   */
  async executeWithTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Step timeout')), timeout)
      )
    ]);
  }

  /**
   * Delay helper
   * @param {number} ms - Milliseconds to delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset the flow
   */
  reset() {
    this.currentStep = 0;
    this.context = {};
  }

  /**
   * Get flow metadata
   * @returns {Object}
   */
  getMetadata() {
    return {
      name: this.name,
      steps: this.steps.map(s => ({ id: s.id, name: s.name })),
      currentStep: this.currentStep
    };
  }
}

module.exports = BaseFlow;