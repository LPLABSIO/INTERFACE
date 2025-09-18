/**
 * Project System IPC Handlers
 * Manages communication between UI and Project System
 */

const { ipcMain } = require('electron');
const ProjectManager = require('../../projects/core/ProjectManager');
const { createOrchestratorAdapter } = require('../../projects/integration/OrchestratorAdapter');
const ProjectGenerator = require('../../projects/generator/ProjectGenerator');
const HingeProject = require('../../projects/apps/HingeProject');

class ProjectHandlers {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.projectManager = new ProjectManager();
        this.adapter = null;
        this.runningProjects = new Map();

        this.setupHandlers();
        this.initialize();
    }

    async initialize() {
        // Create orchestrator adapter if available
        if (this.orchestrator) {
            this.adapter = await createOrchestratorAdapter(this.orchestrator);
        }
    }

    setupHandlers() {
        // Get available projects
        ipcMain.handle('projects:list', async () => {
            return this.getAvailableProjects();
        });

        // Execute project
        ipcMain.handle('projects:execute', async (event, config) => {
            return this.executeProject(event, config);
        });

        // Stop project
        ipcMain.handle('projects:stop', async (event, projectId) => {
            return this.stopProject(projectId);
        });

        // Generate new project
        ipcMain.handle('projects:generate', async (event, config) => {
            return this.generateProject(config);
        });

        // Get project status
        ipcMain.handle('projects:status', async (event, projectName) => {
            return this.getProjectStatus(projectName);
        });

        // Get running projects
        ipcMain.handle('projects:running', async () => {
            return this.getRunningProjects();
        });

        // Get execution history
        ipcMain.handle('projects:history', async () => {
            return this.projectManager.getExecutionHistory();
        });
    }

    async getAvailableProjects() {
        // Return list of available projects
        const projects = [];

        // Add HingeProject
        projects.push({
            name: 'Hinge',
            version: '2.0.0',
            description: 'Hinge dating app automation',
            flows: ['setup', 'registration', 'main', 'recovery'],
            providers: ['sms', 'proxy', 'vpn'],
            stats: await this.getProjectStats('Hinge'),
            status: 'ready',
            icon: '💝'
        });

        // In future, dynamically load all projects
        // const projectFiles = await this.scanProjectDirectory();
        // for (const file of projectFiles) {
        //     const project = await this.loadProjectMetadata(file);
        //     projects.push(project);
        // }

        return projects;
    }

    async executeProject(event, config) {
        console.log('[ProjectHandlers] Executing project:', config);

        try {
            // Get device info
            const device = this.orchestrator?.deviceManager?.getDevice(config.device) || {
                udid: config.device,
                name: 'Unknown Device',
                version: '16.0'
            };

            // Create project configuration
            const projectConfig = {
                device: {
                    udid: device.udid,
                    name: device.name,
                    platformVersion: device.version
                },
                appiumPort: config.appiumPort || 4723,
                wdaPort: config.wdaPort || 8100,
                locations: this.getLocations(config.location),
                proxyConfig: {
                    provider: config.proxyProvider || 'marsproxies',
                    username: process.env.MARSPROXIES_USERNAME,
                    password: process.env.MARSPROXIES_PASSWORD
                },
                smsConfig: {
                    provider: config.smsProvider || 'api21k',
                    apiKey: process.env[`SMS_${config.smsProvider?.toUpperCase()}_KEY`]
                }
            };

            let project;

            // Create project instance based on type
            switch (config.project.toLowerCase()) {
                case 'hinge':
                    project = new HingeProject(projectConfig);
                    break;
                case 'tinder':
                    // project = new TinderProject(projectConfig);
                    throw new Error('TinderProject not yet implemented');
                case 'bumble':
                    // project = new BumbleProject(projectConfig);
                    throw new Error('BumbleProject not yet implemented');
                default:
                    throw new Error(`Unknown project: ${config.project}`);
            }

            // Initialize project
            await project.initialize();

            // Create execution ID
            const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            // Store running project
            this.runningProjects.set(executionId, {
                project,
                config,
                startTime: Date.now(),
                status: 'running'
            });

            // Send start event to UI
            event.sender.send('project:update', {
                type: 'started',
                executionId,
                project: config.project,
                device: config.device,
                config
            });

            // Execute project asynchronously
            this.runProjectAsync(executionId, project, event.sender);

            return {
                success: true,
                executionId,
                message: `Project ${config.project} started`
            };
        } catch (error) {
            console.error('[ProjectHandlers] Execution error:', error);
            throw error;
        }
    }

    async runProjectAsync(executionId, project, sender) {
        const execution = this.runningProjects.get(executionId);

        try {
            // Set up flow event listeners
            project.flows.forEach((flow, flowName) => {
                flow.on('step:start', (step) => {
                    sender.send('flow:update', {
                        executionId,
                        flow: flowName,
                        step: step.name,
                        status: 'running'
                    });
                });

                flow.on('step:complete', (step) => {
                    sender.send('flow:update', {
                        executionId,
                        flow: flowName,
                        step: step.name,
                        status: 'completed'
                    });
                });

                flow.on('step:error', (step, error) => {
                    sender.send('flow:update', {
                        executionId,
                        flow: flowName,
                        step: step.name,
                        status: 'failed',
                        error: error.message
                    });
                });
            });

            // Execute project
            const result = await project.execute();

            // Update execution status
            execution.status = result.success ? 'completed' : 'failed';
            execution.result = result;
            execution.endTime = Date.now();

            // Send completion event
            sender.send('project:update', {
                type: result.success ? 'completed' : 'failed',
                executionId,
                project: execution.config.project,
                device: execution.config.device,
                result,
                duration: execution.endTime - execution.startTime
            });

            // Add to history
            this.projectManager.executionHistory.unshift({
                executionId,
                ...execution.config,
                startTime: execution.startTime,
                endTime: execution.endTime,
                duration: execution.endTime - execution.startTime,
                status: execution.status,
                result: result.data
            });

            // Limit history size
            if (this.projectManager.executionHistory.length > 100) {
                this.projectManager.executionHistory = this.projectManager.executionHistory.slice(0, 100);
            }
        } catch (error) {
            console.error('[ProjectHandlers] Project execution error:', error);

            execution.status = 'failed';
            execution.error = error.message;
            execution.endTime = Date.now();

            sender.send('project:update', {
                type: 'failed',
                executionId,
                project: execution.config.project,
                device: execution.config.device,
                error: error.message,
                duration: execution.endTime - execution.startTime
            });
        } finally {
            // Cleanup
            await project.cleanup();

            // Remove from running projects after a delay
            setTimeout(() => {
                this.runningProjects.delete(executionId);
            }, 5000);
        }
    }

    async stopProject(executionId) {
        console.log('[ProjectHandlers] Stopping project:', executionId);

        const execution = this.runningProjects.get(executionId);
        if (!execution) {
            throw new Error(`Project ${executionId} not found`);
        }

        try {
            // Cleanup project
            await execution.project.cleanup();

            // Update status
            execution.status = 'stopped';
            execution.endTime = Date.now();

            // Remove from running projects
            this.runningProjects.delete(executionId);

            return {
                success: true,
                message: `Project ${executionId} stopped`
            };
        } catch (error) {
            console.error('[ProjectHandlers] Error stopping project:', error);
            throw error;
        }
    }

    async generateProject(config) {
        console.log('[ProjectHandlers] Generating project:', config);

        try {
            const generator = new ProjectGenerator();

            const result = await generator.generateProject(config.name, {
                description: config.description || `${config.name} automation project`,
                version: config.version || '1.0.0',
                author: config.author || 'Automation Platform',
                providers: config.providers || ['sms', 'proxy'],
                flows: config.flows || ['setup', 'main', 'cleanup'],
                generateTests: config.generateTests !== false,
                generateDocs: config.generateDocs !== false
            });

            return result;
        } catch (error) {
            console.error('[ProjectHandlers] Generation error:', error);
            throw error;
        }
    }

    async getProjectStatus(projectName) {
        // Check if project is running
        for (const [id, execution] of this.runningProjects) {
            if (execution.config.project === projectName) {
                return {
                    status: 'running',
                    executionId: id,
                    startTime: execution.startTime,
                    runtime: Date.now() - execution.startTime
                };
            }
        }

        // Return idle status
        return {
            status: 'idle',
            lastExecution: this.getLastExecution(projectName)
        };
    }

    getRunningProjects() {
        const projects = [];

        for (const [id, execution] of this.runningProjects) {
            projects.push({
                executionId: id,
                project: execution.config.project,
                device: execution.config.device,
                status: execution.status,
                startTime: execution.startTime,
                runtime: Date.now() - execution.startTime
            });
        }

        return projects;
    }

    getLastExecution(projectName) {
        return this.projectManager.executionHistory.find(
            h => h.project === projectName
        );
    }

    async getProjectStats(projectName) {
        const history = this.projectManager.executionHistory.filter(
            h => h.project === projectName
        );

        const successful = history.filter(h => h.status === 'completed').length;
        const total = history.length;

        const avgDuration = history.length > 0
            ? Math.floor(history.reduce((sum, h) => sum + (h.duration || 0), 0) / history.length / 1000)
            : 0;

        return {
            executions: total,
            successRate: total > 0 ? Math.floor((successful / total) * 100) : 0,
            avgDuration
        };
    }

    getLocations(locationCode) {
        const locations = {
            nyc: { city: 'New York', state: 'NY', country: 'usa', lat: 40.7128, lon: -74.0060 },
            la: { city: 'Los Angeles', state: 'CA', country: 'usa', lat: 34.0522, lon: -118.2437 },
            chi: { city: 'Chicago', state: 'IL', country: 'usa', lat: 41.8781, lon: -87.6298 },
            mia: { city: 'Miami', state: 'FL', country: 'usa', lat: 25.7617, lon: -80.1918 }
        };

        const location = locations[locationCode] || locations.nyc;
        return [location];
    }
}

module.exports = ProjectHandlers;