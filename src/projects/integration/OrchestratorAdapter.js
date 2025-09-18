/**
 * Orchestrator Adapter - Bridge between AppOrchestrator and Project System
 * @module projects/integration/OrchestratorAdapter
 */

const ProjectManager = require('../core/ProjectManager');
const HingeProject = require('../apps/HingeProject');

/**
 * Adapter to integrate Project System with AppOrchestrator
 */
class OrchestratorAdapter {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.projectManager = new ProjectManager();
    this.activeProjects = new Map();
  }

  /**
   * Initialize the adapter
   */
  async initialize() {
    console.log('[OrchestratorAdapter] Initializing...');

    // Register available projects
    await this.registerProjects();

    // Set up event listeners
    this.setupEventListeners();

    console.log('[OrchestratorAdapter] Initialized');
  }

  /**
   * Register available projects
   */
  async registerProjects() {
    // Register HingeProject
    const hingeProject = HingeProject;
    await this.projectManager.registerProject(hingeProject);

    // Register other projects as they're created
    // await this.projectManager.registerProject(TinderProject);
    // await this.projectManager.registerProject(BumbleProject);

    console.log('[OrchestratorAdapter] Registered projects:',
      this.projectManager.getAllProjectsStatus().map(p => p.name));
  }

  /**
   * Set up event listeners for orchestrator
   */
  setupEventListeners() {
    // Listen for session start events
    this.orchestrator.on('session:started', async (sessionData) => {
      await this.handleSessionStart(sessionData);
    });

    // Listen for session stop events
    this.orchestrator.on('session:stopped', async (sessionData) => {
      await this.handleSessionStop(sessionData);
    });

    // Listen for device events
    this.orchestrator.on('device:connected', async (device) => {
      console.log('[OrchestratorAdapter] Device connected:', device.name);
    });

    // Listen for task events
    this.orchestrator.on('task:queued', async (task) => {
      if (task.type === 'project') {
        await this.executeProjectTask(task);
      }
    });
  }

  /**
   * Handle session start
   */
  async handleSessionStart(sessionData) {
    const { sessionId, deviceId, app, config } = sessionData;

    console.log(`[OrchestratorAdapter] Starting project for session ${sessionId}`);

    try {
      // Get device info
      const device = this.orchestrator.deviceManager.getDevice(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // Create project config
      const projectConfig = {
        device: {
          udid: device.udid,
          name: device.name,
          platformVersion: device.version,
          ...device
        },
        appiumPort: config.appiumPort || 4723,
        wdaPort: config.wdaLocalPort || 8100,
        locations: config.locations || [],
        proxyConfig: {
          provider: config.proxyProvider || 'marsproxies',
          ...config.proxyConfig
        },
        smsConfig: {
          provider: config.smsProvider || 'api21k',
          ...config.smsConfig
        },
        emailConfig: config.emailConfig || {}
      };

      // Create and initialize project
      let project;
      switch (app.toLowerCase()) {
        case 'hinge':
          project = new HingeProject(projectConfig);
          break;
        case 'tinder':
          // project = new TinderProject(projectConfig);
          throw new Error('TinderProject not yet migrated');
        case 'bumble':
          // project = new BumbleProject(projectConfig);
          throw new Error('BumbleProject not yet migrated');
        default:
          throw new Error(`Unknown app: ${app}`);
      }

      // Initialize project
      await project.initialize();

      // Store active project
      this.activeProjects.set(sessionId, {
        project,
        app,
        deviceId,
        startTime: Date.now()
      });

      // Execute project
      const context = {
        sessionId,
        deviceId,
        location: config.location
      };

      const result = await project.execute(context);

      // Emit result
      this.orchestrator.emit('project:completed', {
        sessionId,
        app,
        result
      });

      return result;
    } catch (error) {
      console.error(`[OrchestratorAdapter] Project execution failed:`, error);

      this.orchestrator.emit('project:failed', {
        sessionId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Handle session stop
   */
  async handleSessionStop(sessionData) {
    const { sessionId } = sessionData;

    console.log(`[OrchestratorAdapter] Stopping project for session ${sessionId}`);

    const activeProject = this.activeProjects.get(sessionId);
    if (activeProject) {
      try {
        await activeProject.project.cleanup();
        this.activeProjects.delete(sessionId);
        console.log(`[OrchestratorAdapter] Project cleaned up for session ${sessionId}`);
      } catch (error) {
        console.error(`[OrchestratorAdapter] Cleanup error:`, error);
      }
    }
  }

  /**
   * Execute a project task from queue
   */
  async executeProjectTask(task) {
    const { projectName, deviceId, config } = task.data;

    console.log(`[OrchestratorAdapter] Executing project task: ${projectName}`);

    try {
      // Get device
      const device = this.orchestrator.deviceManager.getDevice(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }

      // Create session
      const sessionId = this.generateSessionId();
      const sessionData = {
        sessionId,
        deviceId,
        app: projectName,
        config
      };

      // Start project
      const result = await this.handleSessionStart(sessionData);

      // Update task status
      task.status = 'completed';
      task.result = result;

      return result;
    } catch (error) {
      console.error(`[OrchestratorAdapter] Task execution failed:`, error);
      task.status = 'failed';
      task.error = error.message;
      throw error;
    }
  }

  /**
   * Create a project directly (without orchestrator)
   */
  async createProject(app, config) {
    console.log(`[OrchestratorAdapter] Creating ${app} project`);

    let project;
    switch (app.toLowerCase()) {
      case 'hinge':
        project = new HingeProject(config);
        break;
      default:
        throw new Error(`Unknown app: ${app}`);
    }

    await project.initialize();
    return project;
  }

  /**
   * Execute a project directly
   */
  async executeProject(app, config, context = {}) {
    const project = await this.createProject(app, config);

    try {
      const result = await project.execute(context);
      return result;
    } finally {
      await project.cleanup();
    }
  }

  /**
   * Get status of all active projects
   */
  getActiveProjects() {
    const projects = [];

    for (const [sessionId, data] of this.activeProjects) {
      projects.push({
        sessionId,
        app: data.app,
        deviceId: data.deviceId,
        runtime: Date.now() - data.startTime
      });
    }

    return projects;
  }

  /**
   * Clean up all active projects
   */
  async cleanupAll() {
    console.log('[OrchestratorAdapter] Cleaning up all projects');

    for (const [sessionId, data] of this.activeProjects) {
      try {
        await data.project.cleanup();
      } catch (error) {
        console.error(`[OrchestratorAdapter] Error cleaning up ${sessionId}:`, error);
      }
    }

    this.activeProjects.clear();
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Factory function to create and initialize adapter
 */
async function createOrchestratorAdapter(orchestrator) {
  const adapter = new OrchestratorAdapter(orchestrator);
  await adapter.initialize();
  return adapter;
}

module.exports = {
  OrchestratorAdapter,
  createOrchestratorAdapter
};