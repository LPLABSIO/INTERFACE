/**
 * Project Manager - Central hub for all project operations
 * @module projects/core/ProjectManager
 */

const fs = require('fs').promises;
const path = require('path');
const EventEmitter = require('events');
const { IProject, ProjectResult } = require('./interfaces');

/**
 * Manages all projects in the system
 */
class ProjectManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.projects = new Map();
    this.activeProjects = new Map();
    this.projectsPath = options.projectsPath || path.join(__dirname, '../templates');
    this.config = options.config || {};
    this.orchestrator = options.orchestrator || null;
  }

  /**
   * Initialize the project manager
   */
  async initialize() {
    console.log('[ProjectManager] Initializing...');

    // Load all available projects
    await this.loadProjects();

    // Set up event listeners if orchestrator is available
    if (this.orchestrator) {
      this.setupOrchestratorEvents();
    }

    console.log(`[ProjectManager] Initialized with ${this.projects.size} projects`);
    return true;
  }

  /**
   * Load all available projects from templates directory
   */
  async loadProjects() {
    try {
      const files = await fs.readdir(this.projectsPath);

      for (const file of files) {
        if (file.endsWith('.js')) {
          const projectPath = path.join(this.projectsPath, file);
          await this.loadProject(projectPath);
        }
      }
    } catch (error) {
      console.error('[ProjectManager] Error loading projects:', error);
    }
  }

  /**
   * Load a single project
   * @param {string} projectPath - Path to project file
   */
  async loadProject(projectPath) {
    try {
      const ProjectClass = require(projectPath);

      // Verify it's a valid project
      if (!ProjectClass || !ProjectClass.prototype) {
        console.warn(`[ProjectManager] Invalid project at ${projectPath}`);
        return;
      }

      // Create instance to get metadata
      const tempInstance = new ProjectClass();
      const metadata = tempInstance.getMetadata();

      // Store project class for later instantiation
      this.projects.set(metadata.name, {
        class: ProjectClass,
        path: projectPath,
        metadata
      });

      console.log(`[ProjectManager] Loaded project: ${metadata.name} v${metadata.version}`);
      this.emit('project:loaded', metadata);
    } catch (error) {
      console.error(`[ProjectManager] Error loading project from ${projectPath}:`, error);
    }
  }

  /**
   * Register a new project
   * @param {string} name - Project name
   * @param {class} ProjectClass - Project class
   */
  registerProject(name, ProjectClass) {
    if (!ProjectClass || !ProjectClass.prototype) {
      throw new Error('Invalid project class');
    }

    const tempInstance = new ProjectClass();
    const metadata = tempInstance.getMetadata();

    this.projects.set(name, {
      class: ProjectClass,
      metadata
    });

    console.log(`[ProjectManager] Registered project: ${name}`);
    this.emit('project:registered', metadata);
  }

  /**
   * Create a new project instance
   * @param {string} name - Project name
   * @param {Object} config - Project configuration
   * @returns {IProject}
   */
  async createProject(name, config = {}) {
    const projectInfo = this.projects.get(name);

    if (!projectInfo) {
      throw new Error(`Project '${name}' not found`);
    }

    const project = new projectInfo.class(config);
    await project.initialize();

    // Store active project
    const projectId = `${name}_${Date.now()}`;
    this.activeProjects.set(projectId, project);

    console.log(`[ProjectManager] Created project instance: ${projectId}`);
    this.emit('project:created', { id: projectId, name });

    return { id: projectId, project };
  }

  /**
   * Execute a project
   * @param {string} projectId - Project ID
   * @param {Object} context - Execution context
   * @returns {ProjectResult}
   */
  async executeProject(projectId, context = {}) {
    const project = this.activeProjects.get(projectId);

    if (!project) {
      throw new Error(`Active project '${projectId}' not found`);
    }

    console.log(`[ProjectManager] Executing project: ${projectId}`);
    this.emit('project:executing', projectId);

    const startTime = Date.now();

    try {
      // Validate project before execution
      const isValid = await project.validate();
      if (!isValid) {
        throw new Error('Project validation failed');
      }

      // Execute project
      const result = await project.execute(context);
      result.executionTime = Date.now() - startTime;

      console.log(`[ProjectManager] Project ${projectId} completed in ${result.executionTime}ms`);
      this.emit('project:completed', { projectId, result });

      return result;
    } catch (error) {
      const result = new ProjectResult(false, null, error.message);
      result.executionTime = Date.now() - startTime;

      console.error(`[ProjectManager] Project ${projectId} failed:`, error);
      this.emit('project:failed', { projectId, error });

      return result;
    }
  }

  /**
   * Stop a project
   * @param {string} projectId - Project ID
   */
  async stopProject(projectId) {
    const project = this.activeProjects.get(projectId);

    if (!project) {
      console.warn(`[ProjectManager] Project '${projectId}' not found`);
      return;
    }

    console.log(`[ProjectManager] Stopping project: ${projectId}`);

    try {
      await project.cleanup();
      this.activeProjects.delete(projectId);

      console.log(`[ProjectManager] Project ${projectId} stopped`);
      this.emit('project:stopped', projectId);
    } catch (error) {
      console.error(`[ProjectManager] Error stopping project ${projectId}:`, error);
    }
  }

  /**
   * Get all available projects
   * @returns {Array}
   */
  getAvailableProjects() {
    return Array.from(this.projects.entries()).map(([name, info]) => ({
      name,
      ...info.metadata
    }));
  }

  /**
   * Get all active projects
   * @returns {Array}
   */
  getActiveProjects() {
    return Array.from(this.activeProjects.entries()).map(([id, project]) => ({
      id,
      ...project.getMetadata()
    }));
  }

  /**
   * Get project status
   * @param {string} projectId - Project ID
   * @returns {Object}
   */
  getProjectStatus(projectId) {
    const project = this.activeProjects.get(projectId);

    if (!project) {
      return null;
    }

    return {
      id: projectId,
      ...project.getMetadata(),
      active: true
    };
  }

  /**
   * Set up orchestrator event listeners
   */
  setupOrchestratorEvents() {
    if (!this.orchestrator) return;

    // Listen for task execution requests
    this.orchestrator.on('task:execute', async (task) => {
      if (task.type === 'project') {
        try {
          const { project, context } = await this.createProject(task.projectName, task.config);
          const result = await this.executeProject(project.id, context);

          this.orchestrator.emit('task:completed', {
            taskId: task.id,
            result
          });
        } catch (error) {
          this.orchestrator.emit('task:failed', {
            taskId: task.id,
            error: error.message
          });
        }
      }
    });

    console.log('[ProjectManager] Orchestrator events configured');
  }

  /**
   * Clean up all resources
   */
  async cleanup() {
    console.log('[ProjectManager] Cleaning up...');

    // Stop all active projects
    for (const [projectId] of this.activeProjects) {
      await this.stopProject(projectId);
    }

    this.projects.clear();
    this.activeProjects.clear();

    console.log('[ProjectManager] Cleanup completed');
  }
}

module.exports = ProjectManager;