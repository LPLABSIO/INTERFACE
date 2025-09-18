/**
 * Project Generator - Creates new projects from templates
 * @module projects/generator/ProjectGenerator
 */

const fs = require('fs').promises;
const path = require('path');

class ProjectGenerator {
  constructor(options = {}) {
    this.templatesPath = options.templatesPath || path.join(__dirname, 'templates');
    this.outputPath = options.outputPath || path.join(process.cwd(), 'src/projects/templates');
  }

  /**
   * Generate a new project from template
   * @param {string} projectName - Name of the new project
   * @param {Object} options - Generation options
   */
  async generateProject(projectName, options = {}) {
    console.log(`[Generator] Creating new project: ${projectName}`);

    const {
      template = 'basic',
      description = `${projectName} automation project`,
      version = '1.0.0',
      author = 'Automation Platform',
      providers = ['sms', 'proxy'],
      flows = ['main', 'recovery']
    } = options;

    try {
      // Validate project name
      if (!this.isValidProjectName(projectName)) {
        throw new Error('Invalid project name. Use only letters, numbers, and hyphens.');
      }

      // Check if project already exists
      const projectPath = path.join(this.outputPath, `${projectName}Project.js`);
      try {
        await fs.access(projectPath);
        throw new Error(`Project '${projectName}' already exists`);
      } catch (error) {
        // File doesn't exist, good to proceed
        if (error.code !== 'ENOENT') throw error;
      }

      // Generate project content
      const projectContent = await this.generateProjectContent(projectName, {
        description,
        version,
        author,
        providers,
        flows
      });

      // Write project file
      await fs.writeFile(projectPath, projectContent, 'utf8');

      console.log(`[Generator] Project created successfully at: ${projectPath}`);

      // Generate additional files if needed
      if (options.generateTests) {
        await this.generateTestFile(projectName);
      }

      if (options.generateDocs) {
        await this.generateDocumentation(projectName, options);
      }

      return {
        success: true,
        path: projectPath,
        name: projectName
      };
    } catch (error) {
      console.error(`[Generator] Error creating project:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate project content from template
   */
  async generateProjectContent(projectName, options) {
    const className = this.toClassName(projectName);

    return `/**
 * ${projectName} Automation Project
 * ${options.description}
 * @author ${options.author}
 * @version ${options.version}
 */

const { IProject, ProjectResult } = require('../core/interfaces');
const BaseFlow = require('../flows/BaseFlow');
const BaseProvider = require('../providers/BaseProvider');

/**
 * ${projectName} automation project
 */
class ${className}Project extends IProject {
  constructor(config = {}) {
    super();

    this.name = '${projectName}';
    this.version = '${options.version}';
    this.config = {
      device: config.device || null,
      appiumPort: config.appiumPort || 4723,
      wdaPort: config.wdaPort || 8100,
      ...config
    };

    this.flows = new Map();
    this.providers = new Map();
  }

  /**
   * Initialize the project
   */
  async initialize() {
    console.log('[${className}Project] Initializing...');

    // Set up flows
    await this.setupFlows();

    // Set up providers
    await this.setupProviders();

    console.log('[${className}Project] Initialization complete');
  }

  /**
   * Set up project flows
   */
  async setupFlows() {
${options.flows.map(flow => this.generateFlowSetup(flow, className)).join('\n\n')}

    console.log('[${className}Project] Flows configured:', Array.from(this.flows.keys()));
  }

  /**
   * Set up project providers
   */
  async setupProviders() {
${options.providers.map(provider => this.generateProviderSetup(provider, className)).join('\n\n')}

    console.log('[${className}Project] Providers configured:', Array.from(this.providers.keys()));
  }

  /**
   * Execute the project
   * @param {Object} context - Execution context
   * @returns {ProjectResult}
   */
  async execute(context = {}) {
    console.log('[${className}Project] Starting execution');

    const result = new ProjectResult(true, {});
    const startTime = Date.now();

    try {
      // Execute main flow
      const mainFlow = this.flows.get('main');
      const flowResult = await mainFlow.execute(context);

      result.flows.push({
        name: 'main',
        result: flowResult
      });

      if (!flowResult.success && this.flows.has('recovery')) {
        console.log('[${className}Project] Main flow failed, trying recovery');
        const recoveryFlow = this.flows.get('recovery');
        const recoveryResult = await recoveryFlow.execute(context);

        result.flows.push({
          name: 'recovery',
          result: recoveryResult
        });
      }

      result.data = flowResult.data;
      result.success = flowResult.success;
    } catch (error) {
      console.error('[${className}Project] Execution failed:', error);
      result.success = false;
      result.error = error.message;
    } finally {
      result.executionTime = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Validate project configuration
   */
  async validate() {
    console.log('[${className}Project] Validating configuration');

    // Check required config
    if (!this.config.device) {
      console.error('[${className}Project] No device configured');
      return false;
    }

    // Check providers health
    for (const [name, provider] of this.providers) {
      const healthy = await provider.checkHealth();
      if (!healthy) {
        console.error(\`[${className}Project] Provider '\${name}' is unhealthy\`);
        return false;
      }
    }

    return true;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('[${className}Project] Cleaning up');

    // Clean up providers
    for (const [name, provider] of this.providers) {
      await provider.cleanup();
    }

    // Reset flows
    for (const [name, flow] of this.flows) {
      flow.reset();
    }

    console.log('[${className}Project] Cleanup complete');
  }
}

module.exports = ${className}Project;`;
  }

  /**
   * Generate flow setup code
   */
  generateFlowSetup(flowName, className) {
    const flowVarName = `${flowName}Flow`;

    return `    // Create ${flowName} flow
    const ${flowVarName} = new BaseFlow('${flowName}-flow');

    // TODO: Add steps for ${flowName} flow
    ${flowVarName}.addStep({
      name: 'Setup ${flowName}',
      execute: async (context) => {
        console.log('[${className}] Executing ${flowName} flow');
        // Add your ${flowName} logic here
        return { success: true };
      }
    });

    this.flows.set('${flowName}', ${flowVarName});`;
  }

  /**
   * Generate provider setup code
   */
  generateProviderSetup(providerName, className) {
    const providerClass = `${this.toClassName(providerName)}Provider`;

    return `    // Create ${providerName} provider
    const ${providerName}Provider = new (class extends BaseProvider {
      async onInitialize() {
        console.log('[${providerClass}] Initializing');
        // Add initialization logic here
      }

      async onHealthCheck() {
        // Add health check logic here
        return true;
      }

      async onExecute(action, params) {
        // Add provider actions here
        switch (action) {
          case 'test':
            return { success: true };
          default:
            throw new Error(\`Unknown action: \${action}\`);
        }
      }
    })('${providerName}-provider', '${providerName}');

    await ${providerName}Provider.initialize(this.config.${providerName}Config || {});
    this.providers.set('${providerName}', ${providerName}Provider);`;
  }

  /**
   * Generate test file for the project
   */
  async generateTestFile(projectName) {
    const className = this.toClassName(projectName);
    const testPath = path.join(
      process.cwd(),
      'src/projects/__tests__',
      `${className}Project.test.js`
    );

    const testContent = `/**
 * Tests for ${className}Project
 */

const ${className}Project = require('../templates/${className}Project');

describe('${className}Project', () => {
  let project;

  beforeEach(() => {
    project = new ${className}Project({
      device: 'test-device',
      appiumPort: 4723,
      wdaPort: 8100
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(project.initialize()).resolves.not.toThrow();
      expect(project.flows.size).toBeGreaterThan(0);
      expect(project.providers.size).toBeGreaterThan(0);
    });
  });

  describe('validation', () => {
    it('should validate with device configured', async () => {
      await project.initialize();
      const isValid = await project.validate();
      expect(isValid).toBe(true);
    });

    it('should fail validation without device', async () => {
      project.config.device = null;
      await project.initialize();
      const isValid = await project.validate();
      expect(isValid).toBe(false);
    });
  });

  describe('execution', () => {
    it('should execute main flow', async () => {
      await project.initialize();
      const result = await project.execute();
      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await project.initialize();
      await expect(project.cleanup()).resolves.not.toThrow();
    });
  });
});`;

    await fs.writeFile(testPath, testContent, 'utf8');
    console.log(`[Generator] Test file created at: ${testPath}`);
  }

  /**
   * Generate documentation for the project
   */
  async generateDocumentation(projectName, options) {
    const docPath = path.join(
      process.cwd(),
      'docs/projects',
      `${projectName}.md`
    );

    const docContent = `# ${projectName} Project

## Description
${options.description}

## Version
${options.version}

## Configuration

\`\`\`javascript
const project = new ${this.toClassName(projectName)}Project({
  device: 'device-id',
  appiumPort: 4723,
  wdaPort: 8100,
  // Add custom configuration here
});
\`\`\`

## Flows

${options.flows.map(flow => `### ${flow} Flow
- TODO: Document ${flow} flow steps`).join('\n\n')}

## Providers

${options.providers.map(provider => `### ${provider} Provider
- TODO: Document ${provider} provider capabilities`).join('\n\n')}

## Usage

\`\`\`javascript
const ${this.toClassName(projectName)}Project = require('./src/projects/templates/${this.toClassName(projectName)}Project');

// Create and initialize project
const project = new ${this.toClassName(projectName)}Project(config);
await project.initialize();

// Validate configuration
if (await project.validate()) {
  // Execute project
  const result = await project.execute();

  if (result.success) {
    console.log('Project executed successfully:', result.data);
  } else {
    console.error('Project failed:', result.error);
  }
}

// Clean up
await project.cleanup();
\`\`\`

## API Reference

See the [IProject interface](../core/interfaces.js) for complete API documentation.
`;

    // Create docs directory if it doesn't exist
    await fs.mkdir(path.dirname(docPath), { recursive: true });
    await fs.writeFile(docPath, docContent, 'utf8');
    console.log(`[Generator] Documentation created at: ${docPath}`);
  }

  /**
   * Validate project name
   */
  isValidProjectName(name) {
    return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name);
  }

  /**
   * Convert project name to class name
   */
  toClassName(name) {
    return name
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  /**
   * List available templates
   */
  async listTemplates() {
    try {
      const files = await fs.readdir(this.templatesPath);
      return files.filter(file => file.endsWith('.json')).map(file => file.replace('.json', ''));
    } catch (error) {
      console.error('[Generator] Error listing templates:', error);
      return [];
    }
  }
}

module.exports = ProjectGenerator;