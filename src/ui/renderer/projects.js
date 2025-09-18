/**
 * Projects Page Management
 * Handles Project System UI interactions
 */

class ProjectsManager {
    constructor() {
        this.projects = new Map();
        this.runningProjects = new Map();
        this.executionHistory = [];
        this.selectedProject = null;
        this.currentTab = 'available';

        this.init();
    }

    async init() {
        console.log('[ProjectsManager] Initializing...');

        // Load available projects
        await this.loadProjects();

        // Set up event listeners
        this.setupEventListeners();

        // Start polling for updates
        this.startPolling();
    }

    setupEventListeners() {
        // Listen for project events from main process
        if (window.electronAPI) {
            window.electronAPI.onProjectUpdate((event, data) => {
                this.handleProjectUpdate(data);
            });

            window.electronAPI.onFlowUpdate((event, data) => {
                this.updateFlowVisualization(data);
            });
        }
    }

    async loadProjects() {
        try {
            // Get available projects
            const projects = await this.getAvailableProjects();

            this.projects.clear();
            projects.forEach(project => {
                this.projects.set(project.name, project);
            });

            this.renderProjects();
        } catch (error) {
            console.error('[ProjectsManager] Error loading projects:', error);
        }
    }

    async getAvailableProjects() {
        // For now, return hardcoded projects
        // In production, this would fetch from the backend
        return [
            {
                name: 'Hinge',
                version: '2.0.0',
                description: 'Hinge dating app automation',
                flows: ['setup', 'registration', 'main', 'recovery'],
                providers: ['sms', 'proxy', 'vpn'],
                stats: {
                    executions: 156,
                    successRate: 94,
                    avgDuration: 180
                },
                status: 'ready',
                icon: '💝'
            },
            {
                name: 'Tinder',
                version: '1.5.0',
                description: 'Tinder automation with advanced features',
                flows: ['setup', 'onboarding', 'profile', 'swipe'],
                providers: ['sms', 'proxy', 'location'],
                stats: {
                    executions: 89,
                    successRate: 87,
                    avgDuration: 220
                },
                status: 'ready',
                icon: '🔥'
            },
            {
                name: 'Bumble',
                version: '1.0.0',
                description: 'Bumble automation project',
                flows: ['setup', 'registration', 'verification'],
                providers: ['sms', 'proxy'],
                stats: {
                    executions: 45,
                    successRate: 92,
                    avgDuration: 150
                },
                status: 'beta',
                icon: '🐝'
            },
            {
                name: 'POF',
                version: '1.2.0',
                description: 'Plenty of Fish automation',
                flows: ['setup', 'profile', 'messaging'],
                providers: ['email', 'proxy'],
                stats: {
                    executions: 23,
                    successRate: 85,
                    avgDuration: 200
                },
                status: 'ready',
                icon: '🐠'
            }
        ];
    }

    renderProjects() {
        const grid = document.getElementById('projects-grid');
        if (!grid) return;

        grid.innerHTML = '';

        this.projects.forEach(project => {
            const card = this.createProjectCard(project);
            grid.appendChild(card);
        });
    }

    createProjectCard(project) {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.onclick = () => this.selectProject(project);

        card.innerHTML = `
            <div class="project-header">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 28px;">${project.icon || '📦'}</span>
                    <div>
                        <div class="project-title">${project.name}</div>
                        <div class="project-version">v${project.version}</div>
                    </div>
                </div>
                <span class="status-indicator ${project.status === 'ready' ? 'idle' : 'error'}"></span>
            </div>

            <div class="project-description">${project.description}</div>

            <div class="project-stats">
                <div class="stat-item">
                    <div class="stat-value">${project.stats.executions}</div>
                    <div class="stat-label">Runs</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${project.stats.successRate}%</div>
                    <div class="stat-label">Success</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${project.stats.avgDuration}s</div>
                    <div class="stat-label">Avg Time</div>
                </div>
            </div>

            <div class="project-flows">
                ${project.flows.map(flow => `
                    <span class="flow-badge">${flow}</span>
                `).join('')}
            </div>

            <div class="project-providers">
                ${project.providers.map(provider => `
                    <span class="provider-badge">${provider}</span>
                `).join('')}
            </div>

            <div class="project-actions">
                <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); projectsManager.quickExecute('${project.name}')">
                    Quick Run
                </button>
                <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); projectsManager.viewDetails('${project.name}')">
                    Details
                </button>
            </div>
        `;

        return card;
    }

    selectProject(project) {
        this.selectedProject = project;
        this.showExecutionPanel(project);
    }

    showExecutionPanel(project) {
        const panel = document.getElementById('execution-panel');
        const nameSpan = document.getElementById('selected-project-name');

        if (panel && nameSpan) {
            nameSpan.textContent = project.name;
            panel.style.display = 'block';

            // Load devices
            this.loadDevices();

            // Scroll to panel
            panel.scrollIntoView({ behavior: 'smooth' });
        }
    }

    closeExecutionPanel() {
        const panel = document.getElementById('execution-panel');
        if (panel) {
            panel.style.display = 'none';
        }
        this.selectedProject = null;
    }

    async loadDevices() {
        const select = document.getElementById('device-select');
        if (!select) return;

        // Get devices from main process
        if (window.electronAPI) {
            const devices = await window.electronAPI.getDevices();

            select.innerHTML = '<option value="">Select Device...</option>';
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.udid;
                option.textContent = `${device.name} (${device.version})`;
                select.appendChild(option);
            });
        }
    }

    async executeProject() {
        if (!this.selectedProject) return;

        const deviceSelect = document.getElementById('device-select');
        const locationSelect = document.getElementById('location-select');
        const smsProvider = document.getElementById('sms-provider');
        const proxyProvider = document.getElementById('proxy-provider');

        if (!deviceSelect.value) {
            alert('Please select a device');
            return;
        }

        const config = {
            project: this.selectedProject.name,
            device: deviceSelect.value,
            location: locationSelect.value,
            smsProvider: smsProvider.value,
            proxyProvider: proxyProvider.value
        };

        console.log('[ProjectsManager] Executing project:', config);

        // Show flow visualization
        this.showFlowVisualization();

        // Send execution request to main process
        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.executeProject(config);
                console.log('[ProjectsManager] Execution result:', result);

                // Add to running projects
                this.addRunningProject(config);

                // Close execution panel
                this.closeExecutionPanel();

                // Switch to running tab
                this.switchTab('running');
            } catch (error) {
                console.error('[ProjectsManager] Execution error:', error);
                alert(`Execution failed: ${error.message}`);
            }
        }
    }

    quickExecute(projectName) {
        const project = this.projects.get(projectName);
        if (!project) return;

        // Use default configuration for quick execution
        console.log('[ProjectsManager] Quick executing:', projectName);

        // In production, this would use smart defaults or last used config
        alert(`Quick execution for ${projectName} would start with default settings`);
    }

    viewDetails(projectName) {
        const project = this.projects.get(projectName);
        if (!project) return;

        console.log('[ProjectsManager] Viewing details for:', projectName);
        // Could open a modal or navigate to a details page
    }

    showFlowVisualization() {
        const viz = document.getElementById('flow-visualization');
        const stepsContainer = document.getElementById('flow-steps');

        if (!viz || !stepsContainer || !this.selectedProject) return;

        viz.style.display = 'block';
        stepsContainer.innerHTML = '';

        // Create flow steps
        this.selectedProject.flows.forEach((flow, index) => {
            if (index > 0) {
                const arrow = document.createElement('span');
                arrow.className = 'flow-arrow';
                arrow.textContent = '→';
                stepsContainer.appendChild(arrow);
            }

            const step = document.createElement('div');
            step.className = 'flow-step';
            step.id = `flow-step-${flow}`;
            step.innerHTML = `
                <div style="font-weight: 600;">${flow}</div>
                <div style="font-size: 11px; color: var(--text-secondary);">Pending</div>
            `;
            stepsContainer.appendChild(step);
        });
    }

    updateFlowVisualization(data) {
        const { flow, status } = data;
        const step = document.getElementById(`flow-step-${flow}`);

        if (step) {
            // Remove all status classes
            step.classList.remove('active', 'completed', 'failed');

            // Add appropriate class
            if (status === 'running') {
                step.classList.add('active');
                step.querySelector('div:last-child').textContent = 'Running...';
            } else if (status === 'completed') {
                step.classList.add('completed');
                step.querySelector('div:last-child').textContent = 'Completed';
            } else if (status === 'failed') {
                step.classList.add('failed');
                step.querySelector('div:last-child').textContent = 'Failed';
            }
        }
    }

    addRunningProject(config) {
        const id = `project-${Date.now()}`;
        const runningProject = {
            id,
            ...config,
            startTime: Date.now(),
            status: 'running'
        };

        this.runningProjects.set(id, runningProject);
        this.renderRunningProjects();
    }

    renderRunningProjects() {
        const grid = document.getElementById('running-projects-grid');
        if (!grid) return;

        grid.innerHTML = '';

        if (this.runningProjects.size === 0) {
            grid.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">No projects running</p>';
            return;
        }

        this.runningProjects.forEach(project => {
            const card = this.createRunningProjectCard(project);
            grid.appendChild(card);
        });
    }

    createRunningProjectCard(project) {
        const runtime = Math.floor((Date.now() - project.startTime) / 1000);
        const minutes = Math.floor(runtime / 60);
        const seconds = runtime % 60;

        const card = document.createElement('div');
        card.className = 'project-card';

        card.innerHTML = `
            <div class="project-header">
                <div>
                    <div class="project-title">
                        <span class="status-indicator running"></span>
                        ${project.project}
                    </div>
                    <div class="project-version">Device: ${project.device}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 20px; font-weight: 600;">
                        ${minutes}:${seconds.toString().padStart(2, '0')}
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary);">Runtime</div>
                </div>
            </div>

            <div class="project-stats">
                <div class="stat-item">
                    <div class="stat-value">${project.location}</div>
                    <div class="stat-label">Location</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${project.smsProvider}</div>
                    <div class="stat-label">SMS</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${project.proxyProvider}</div>
                    <div class="stat-label">Proxy</div>
                </div>
            </div>

            <div class="project-actions">
                <button class="btn btn-sm btn-danger" onclick="projectsManager.stopProject('${project.id}')">
                    Stop
                </button>
                <button class="btn btn-sm btn-secondary" onclick="projectsManager.viewLogs('${project.id}')">
                    View Logs
                </button>
            </div>
        `;

        return card;
    }

    async stopProject(projectId) {
        console.log('[ProjectsManager] Stopping project:', projectId);

        if (window.electronAPI) {
            try {
                await window.electronAPI.stopProject(projectId);

                // Remove from running projects
                this.runningProjects.delete(projectId);
                this.renderRunningProjects();

                // Add to history
                this.addToHistory(projectId, 'stopped');
            } catch (error) {
                console.error('[ProjectsManager] Error stopping project:', error);
            }
        }
    }

    viewLogs(projectId) {
        console.log('[ProjectsManager] Viewing logs for:', projectId);
        // Could open a modal with real-time logs
    }

    addToHistory(projectId, status) {
        const project = this.runningProjects.get(projectId);
        if (!project) return;

        const historyEntry = {
            ...project,
            endTime: Date.now(),
            duration: Date.now() - project.startTime,
            status
        };

        this.executionHistory.unshift(historyEntry);

        // Keep only last 100 entries
        if (this.executionHistory.length > 100) {
            this.executionHistory = this.executionHistory.slice(0, 100);
        }

        this.renderHistory();
    }

    renderHistory() {
        const tbody = document.getElementById('history-table');
        if (!tbody) return;

        tbody.innerHTML = '';

        this.executionHistory.forEach(entry => {
            const row = document.createElement('tr');
            const duration = Math.floor(entry.duration / 1000);
            const startTime = new Date(entry.startTime).toLocaleString();

            row.innerHTML = `
                <td>${entry.project}</td>
                <td>${entry.device}</td>
                <td>${startTime}</td>
                <td>${duration}s</td>
                <td>
                    <span class="badge ${entry.status === 'completed' ? 'badge-success' : 'badge-danger'}">
                        ${entry.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-secondary" onclick="projectsManager.viewHistoryDetails('${entry.id}')">
                        Details
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });
    }

    viewHistoryDetails(entryId) {
        console.log('[ProjectsManager] Viewing history details:', entryId);
        // Could show detailed execution report
    }

    switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // Activate selected tab
        const tabButton = document.querySelector(`.tab-button:nth-child(${tabName === 'available' ? 1 : tabName === 'running' ? 2 : 3})`);
        const tabContent = document.getElementById(`${tabName}-tab`);

        if (tabButton) tabButton.classList.add('active');
        if (tabContent) tabContent.classList.add('active');

        // Render appropriate content
        if (tabName === 'running') {
            this.renderRunningProjects();
        } else if (tabName === 'history') {
            this.renderHistory();
        }
    }

    showGenerator() {
        const panel = document.getElementById('generator-panel');
        if (panel) {
            panel.classList.add('active');
        }
    }

    hideGenerator() {
        const panel = document.getElementById('generator-panel');
        if (panel) {
            panel.classList.remove('active');
        }
    }

    async generateProject() {
        const name = document.getElementById('gen-name').value;
        const description = document.getElementById('gen-description').value;
        const version = document.getElementById('gen-version').value;
        const author = document.getElementById('gen-author').value;
        const providers = document.getElementById('gen-providers').value;
        const flows = document.getElementById('gen-flows').value;

        if (!name) {
            alert('Please enter a project name');
            return;
        }

        const config = {
            name,
            description,
            version,
            author,
            providers: providers.split(',').map(p => p.trim()),
            flows: flows.split(',').map(f => f.trim())
        };

        console.log('[ProjectsManager] Generating project:', config);

        if (window.electronAPI) {
            try {
                const result = await window.electronAPI.generateProject(config);
                console.log('[ProjectsManager] Project generated:', result);

                alert(`Project "${name}" generated successfully!`);

                // Hide generator
                this.hideGenerator();

                // Reload projects
                await this.loadProjects();
            } catch (error) {
                console.error('[ProjectsManager] Generation error:', error);
                alert(`Generation failed: ${error.message}`);
            }
        }
    }

    refreshProjects() {
        console.log('[ProjectsManager] Refreshing projects...');
        this.loadProjects();
        this.renderRunningProjects();
        this.renderHistory();
    }

    handleProjectUpdate(data) {
        console.log('[ProjectsManager] Project update:', data);

        // Update UI based on project events
        if (data.type === 'started') {
            this.addRunningProject(data.config);
        } else if (data.type === 'completed' || data.type === 'failed') {
            const project = Array.from(this.runningProjects.values())
                .find(p => p.project === data.project && p.device === data.device);

            if (project) {
                this.runningProjects.delete(project.id);
                this.addToHistory(project.id, data.type === 'completed' ? 'completed' : 'failed');
                this.renderRunningProjects();
            }
        }
    }

    startPolling() {
        // Poll for updates every 5 seconds
        setInterval(() => {
            if (this.currentTab === 'running') {
                this.renderRunningProjects();
            }
        }, 5000);
    }
}

// Initialize on page load
const projectsManager = new ProjectsManager();