/**
 * Project System Entry Point
 * @module projects
 */

// Core interfaces
const {
  IProject,
  IFlow,
  IProvider,
  ProjectResult,
  FlowResult
} = require('./core/interfaces');

// Core components
const ProjectManager = require('./core/ProjectManager');

// Base implementations
const BaseFlow = require('./flows/BaseFlow');
const BaseProvider = require('./providers/BaseProvider');

// Templates
const HingeProject = require('./templates/HingeProject');

module.exports = {
  // Interfaces
  IProject,
  IFlow,
  IProvider,
  ProjectResult,
  FlowResult,

  // Core
  ProjectManager,

  // Base implementations
  BaseFlow,
  BaseProvider,

  // Templates
  HingeProject,

  // Factory function for easy project manager creation
  createProjectManager: (options = {}) => {
    const manager = new ProjectManager(options);

    // Auto-register default projects
    manager.registerProject('hinge', HingeProject);

    return manager;
  }
};