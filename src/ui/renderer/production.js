/**
 * Production Manager
 * Manages multi-device account creation with resource pooling
 */

class ProductionManager {
    constructor() {
        this.devices = new Map();
        this.selectedDevices = new Set();
        this.activeProductions = new Map();
        this.resourcePools = {
            emails: [],
            locations: [],
            proxies: [],
            usedEmails: new Set(),
            usedLocations: new Set(),
            usedProxies: new Set()
        };
        this.stats = {
            totalAccounts: 0,
            successfulAccounts: 0,
            failedAccounts: 0,
            activeDevices: 0
        };
        this.logFilter = 'all';
        this.init();
    }

    async init() {
        console.log('[ProductionManager] Initializing...');

        // Load available devices
        await this.loadDevices();

        // Load resource pools
        await this.loadResourcePools();

        // Setup event listeners
        this.setupEventListeners();

        // Setup IPC listeners for real-time updates
        this.setupIPCListeners();

        // Initial UI update
        this.updateUI();

        // Start monitoring
        this.startMonitoring();
    }

    async loadDevices() {
        try {
            const devices = await window.electronAPI.getDevices();
            this.devices.clear();

            devices.forEach(device => {
                this.devices.set(device.udid, {
                    ...device,
                    status: 'idle',
                    progress: 0,
                    currentStep: '',
                    accountsCreated: 0,
                    accountsFailed: 0,
                    startTime: null
                });
            });

            this.renderDeviceList();
            this.log('info', 'System', `Loaded ${devices.length} device(s)`);
        } catch (error) {
            this.log('error', 'System', `Failed to load devices: ${error.message}`);
        }
    }

    async loadResourcePools() {
        try {
            // Load emails from file
            const emails = await window.electronAPI.loadResourceFile('emails.txt');
            this.resourcePools.emails = emails ? emails.split('\n').filter(e => e.trim()) : [];

            // Load locations from file
            const locations = await window.electronAPI.loadResourceFile('locations.txt');
            this.resourcePools.locations = locations ? locations.split('\n').filter(l => l.trim()) : [];

            // Initialize proxies (will be fetched from provider)
            this.resourcePools.proxies = [];

            this.updateResourceStatus();
            this.log('info', 'System', `Loaded ${this.resourcePools.emails.length} emails, ${this.resourcePools.locations.length} locations`);
        } catch (error) {
            this.log('error', 'System', `Failed to load resources: ${error.message}`);
        }
    }

    renderDeviceList() {
        const deviceList = document.getElementById('device-list');
        deviceList.innerHTML = '';

        this.devices.forEach((device, udid) => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item';
            deviceItem.dataset.udid = udid;

            if (this.selectedDevices.has(udid)) {
                deviceItem.classList.add('selected');
            }

            deviceItem.innerHTML = `
                <input type="checkbox" class="device-checkbox"
                       ${this.selectedDevices.has(udid) ? 'checked' : ''}>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${device.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        ${device.model} • iOS ${device.ios}
                    </div>
                </div>
                <span class="status-badge ${device.status}">${device.status}</span>
            `;

            deviceItem.addEventListener('click', () => this.toggleDevice(udid));
            deviceList.appendChild(deviceItem);
        });
    }

    toggleDevice(udid) {
        if (this.selectedDevices.has(udid)) {
            this.selectedDevices.delete(udid);
        } else {
            this.selectedDevices.add(udid);
        }
        this.renderDeviceList();
    }

    selectAllDevices() {
        this.devices.forEach((device, udid) => {
            this.selectedDevices.add(udid);
        });
        this.renderDeviceList();
    }

    deselectAllDevices() {
        this.selectedDevices.clear();
        this.renderDeviceList();
    }

    async startProduction() {
        if (this.selectedDevices.size === 0) {
            alert('Please select at least one device');
            return;
        }

        const app = document.getElementById('app-select').value;
        const accountsPerDevice = parseInt(document.getElementById('accounts-per-device').value);
        const proxyProvider = document.getElementById('proxy-provider').value;
        const smsProvider = document.getElementById('sms-provider').value;

        // Validate resources
        const totalAccountsNeeded = this.selectedDevices.size * accountsPerDevice;
        const availableEmails = this.resourcePools.emails.length - this.resourcePools.usedEmails.size;
        const availableLocations = this.resourcePools.locations.length - this.resourcePools.usedLocations.size;

        if (availableEmails < totalAccountsNeeded) {
            alert(`Not enough emails. Need ${totalAccountsNeeded}, have ${availableEmails}`);
            return;
        }

        if (availableLocations < this.selectedDevices.size) {
            alert(`Not enough unique locations. Need ${this.selectedDevices.size}, have ${availableLocations}`);
            return;
        }

        this.log('info', 'System', `Starting production: ${this.selectedDevices.size} devices, ${accountsPerDevice} accounts each`);

        // Start production for each selected device
        for (const udid of this.selectedDevices) {
            await this.startDeviceProduction(udid, {
                app,
                accountsPerDevice,
                proxyProvider,
                smsProvider
            });
        }

        this.updateUI();
    }

    async startDeviceProduction(udid, config) {
        const device = this.devices.get(udid);
        if (!device) return;

        // Allocate resources for this device
        const allocatedResources = await this.allocateResources(udid, config.accountsPerDevice);

        if (!allocatedResources) {
            this.log('error', device.name, 'Failed to allocate resources');
            return;
        }

        // Update device status
        device.status = 'running';
        device.startTime = Date.now();
        device.progress = 0;
        device.currentStep = 'Initializing...';

        // Create production task
        const production = {
            udid,
            config,
            resources: allocatedResources,
            currentAccount: 0,
            status: 'running'
        };

        this.activeProductions.set(udid, production);

        // Start production via IPC
        try {
            const result = await window.electronAPI.startProduction({
                udid,
                app: config.app,
                accounts: config.accountsPerDevice,
                resources: allocatedResources,
                providers: {
                    proxy: config.proxyProvider,
                    sms: config.smsProvider
                }
            });

            this.log('success', device.name, 'Production started');
            this.createDeviceMonitor(udid);
        } catch (error) {
            this.log('error', device.name, `Failed to start: ${error.message}`);
            device.status = 'error';
            this.releaseResources(allocatedResources);
        }

        this.updateUI();
    }

    async allocateResources(udid, accountCount) {
        const allocated = {
            emails: [],
            location: null,
            proxies: []
        };

        try {
            // Allocate unique emails
            const availableEmails = this.resourcePools.emails.filter(
                email => !this.resourcePools.usedEmails.has(email)
            );

            if (availableEmails.length < accountCount) {
                throw new Error('Not enough emails available');
            }

            allocated.emails = availableEmails.slice(0, accountCount);
            allocated.emails.forEach(email => this.resourcePools.usedEmails.add(email));

            // Allocate unique location
            const availableLocations = this.resourcePools.locations.filter(
                loc => !this.resourcePools.usedLocations.has(loc)
            );

            if (availableLocations.length === 0) {
                throw new Error('No locations available');
            }

            allocated.location = availableLocations[0];
            this.resourcePools.usedLocations.add(allocated.location);

            // Allocate proxies (can be reused)
            // For now, we'll generate proxy info dynamically
            allocated.proxies = await this.allocateProxies(accountCount, allocated.location);

            this.updateResourceStatus();
            return allocated;

        } catch (error) {
            // Rollback allocations on error
            this.releaseResources(allocated);
            throw error;
        }
    }

    async allocateProxies(count, location) {
        // This would normally fetch from proxy provider
        // For now, return placeholder
        const proxies = [];
        for (let i = 0; i < count; i++) {
            proxies.push({
                host: `proxy-${location}-${i}.marsproxies.com`,
                port: 8080,
                username: 'user',
                password: 'pass'
            });
        }
        return proxies;
    }

    releaseResources(resources) {
        if (!resources) return;

        // Release emails
        if (resources.emails) {
            resources.emails.forEach(email => {
                this.resourcePools.usedEmails.delete(email);
            });
        }

        // Release location
        if (resources.location) {
            this.resourcePools.usedLocations.delete(resources.location);
        }

        this.updateResourceStatus();
    }

    createDeviceMonitor(udid) {
        const device = this.devices.get(udid);
        if (!device) return;

        const monitorGrid = document.getElementById('monitor-grid');

        // Remove existing monitor if any
        const existingMonitor = document.getElementById(`monitor-${udid}`);
        if (existingMonitor) {
            existingMonitor.remove();
        }

        const monitor = document.createElement('div');
        monitor.id = `monitor-${udid}`;
        monitor.className = 'device-monitor active';
        monitor.innerHTML = `
            <div class="monitor-header">
                <div class="device-name">
                    📱 ${device.name}
                </div>
                <span class="status-badge ${device.status}">${device.status}</span>
            </div>
            <div class="progress-section">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="font-size: 12px;">Progress</span>
                    <span style="font-size: 12px;">${device.progress}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${device.progress}%"></div>
                </div>
                <div class="current-step pulse">${device.currentStep}</div>
            </div>
            <div class="monitor-stats">
                <div class="monitor-stat">
                    <div class="monitor-stat-value">${device.accountsCreated}</div>
                    <div class="monitor-stat-label">Created</div>
                </div>
                <div class="monitor-stat">
                    <div class="monitor-stat-value">${device.accountsFailed}</div>
                    <div class="monitor-stat-label">Failed</div>
                </div>
                <div class="monitor-stat">
                    <div class="monitor-stat-value">${this.getElapsedTime(device.startTime)}</div>
                    <div class="monitor-stat-label">Time</div>
                </div>
            </div>
        `;

        monitorGrid.appendChild(monitor);
    }

    updateDeviceMonitor(udid) {
        const device = this.devices.get(udid);
        if (!device) return;

        const monitor = document.getElementById(`monitor-${udid}`);
        if (!monitor) {
            this.createDeviceMonitor(udid);
            return;
        }

        // Update status
        monitor.className = `device-monitor ${device.status === 'running' ? 'active' : device.status}`;
        monitor.querySelector('.status-badge').className = `status-badge ${device.status}`;
        monitor.querySelector('.status-badge').textContent = device.status;

        // Update progress
        monitor.querySelector('.progress-fill').style.width = `${device.progress}%`;
        monitor.querySelector('.progress-section span:last-child').textContent = `${device.progress}%`;
        monitor.querySelector('.current-step').textContent = device.currentStep;

        // Update stats
        const stats = monitor.querySelectorAll('.monitor-stat-value');
        stats[0].textContent = device.accountsCreated;
        stats[1].textContent = device.accountsFailed;
        stats[2].textContent = this.getElapsedTime(device.startTime);
    }

    async pauseProduction() {
        this.log('info', 'System', 'Pausing all productions');

        for (const [udid, production] of this.activeProductions) {
            if (production.status === 'running') {
                await window.electronAPI.pauseProduction(udid);
                production.status = 'paused';
                const device = this.devices.get(udid);
                if (device) {
                    device.status = 'paused';
                }
            }
        }

        this.updateUI();
    }

    async stopProduction() {
        if (!confirm('Are you sure you want to stop all productions?')) return;

        this.log('warning', 'System', 'Stopping all productions');

        for (const [udid, production] of this.activeProductions) {
            await this.stopDeviceProduction(udid);
        }

        this.updateUI();
    }

    async stopDeviceProduction(udid) {
        const production = this.activeProductions.get(udid);
        if (!production) return;

        try {
            await window.electronAPI.stopProduction(udid);

            const device = this.devices.get(udid);
            if (device) {
                device.status = 'idle';
                device.currentStep = 'Stopped';
                this.log('warning', device.name, 'Production stopped');
            }

            // Release resources
            this.releaseResources(production.resources);

            // Remove from active productions
            this.activeProductions.delete(udid);

        } catch (error) {
            this.log('error', 'System', `Failed to stop ${udid}: ${error.message}`);
        }
    }

    setupEventListeners() {
        // Log filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.logFilter = btn.dataset.filter;
                this.filterLogs();
            });
        });
    }

    setupIPCListeners() {
        // Listen for production updates
        window.electronAPI.onProductionUpdate((event, data) => {
            const { udid, type, payload } = data;
            const device = this.devices.get(udid);

            if (!device) return;

            switch (type) {
                case 'progress':
                    device.progress = payload.progress;
                    device.currentStep = payload.step;
                    this.updateDeviceMonitor(udid);
                    break;

                case 'account-created':
                    device.accountsCreated++;
                    this.stats.successfulAccounts++;
                    this.log('success', device.name, `Account created: ${payload.email}`);
                    this.updateUI();
                    break;

                case 'account-failed':
                    device.accountsFailed++;
                    this.stats.failedAccounts++;
                    this.log('error', device.name, `Account failed: ${payload.error}`);
                    this.updateUI();
                    break;

                case 'completed':
                    device.status = 'completed';
                    device.progress = 100;
                    device.currentStep = 'Completed';
                    this.log('success', device.name, 'Production completed');
                    this.activeProductions.delete(udid);
                    this.updateUI();
                    break;

                case 'error':
                    device.status = 'error';
                    device.currentStep = `Error: ${payload.error}`;
                    this.log('error', device.name, payload.error);
                    this.updateUI();
                    break;

                case 'log':
                    this.log(payload.level || 'info', device.name, payload.message);
                    break;
            }
        });
    }

    startMonitoring() {
        // Update monitors every second
        setInterval(() => {
            this.activeProductions.forEach((production, udid) => {
                if (production.status === 'running') {
                    this.updateDeviceMonitor(udid);
                }
            });
        }, 1000);
    }

    updateUI() {
        // Update stats
        this.stats.activeDevices = this.activeProductions.size;
        this.stats.totalAccounts = this.stats.successfulAccounts + this.stats.failedAccounts;

        document.getElementById('active-devices').textContent = this.stats.activeDevices;
        document.getElementById('accounts-created').textContent = this.stats.successfulAccounts;

        const successRate = this.stats.totalAccounts > 0
            ? Math.round((this.stats.successfulAccounts / this.stats.totalAccounts) * 100)
            : 0;
        document.getElementById('success-rate').textContent = `${successRate}%`;

        // Update device list
        this.renderDeviceList();

        // Update monitors
        this.devices.forEach((device, udid) => {
            this.updateDeviceMonitor(udid);
        });

        // Update resource status
        this.updateResourceStatus();
    }

    updateResourceStatus() {
        // Emails
        const emailsUsed = this.resourcePools.usedEmails.size;
        const emailsTotal = this.resourcePools.emails.length;
        const emailsAvailable = emailsTotal - emailsUsed;

        document.getElementById('emails-available').textContent = emailsAvailable;
        document.getElementById('emails-total').textContent = emailsTotal;
        document.getElementById('emails-usage').style.width =
            `${emailsTotal > 0 ? (emailsUsed / emailsTotal) * 100 : 0}%`;

        // Locations
        const locationsUsed = this.resourcePools.usedLocations.size;
        const locationsTotal = this.resourcePools.locations.length;
        const locationsAvailable = locationsTotal - locationsUsed;

        document.getElementById('locations-available').textContent = locationsAvailable;
        document.getElementById('locations-total').textContent = locationsTotal;
        document.getElementById('locations-usage').style.width =
            `${locationsTotal > 0 ? (locationsUsed / locationsTotal) * 100 : 0}%`;

        // Proxies (dynamic)
        document.getElementById('proxies-available').textContent = '∞';
        document.getElementById('proxies-total').textContent = '∞';
    }

    log(level, source, message) {
        const timestamp = new Date().toLocaleTimeString();
        const logsContainer = document.getElementById('production-logs');

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${level}`;
        logEntry.dataset.level = level;
        logEntry.innerHTML = `
            <span class="log-timestamp">${timestamp}</span>
            <span class="log-device">[${source}]</span>
            ${message}
        `;

        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // Apply filter
        if (this.logFilter !== 'all' && this.logFilter !== level) {
            logEntry.style.display = 'none';
        }
    }

    filterLogs() {
        const logs = document.querySelectorAll('.log-entry');
        logs.forEach(log => {
            if (this.logFilter === 'all' || log.dataset.level === this.logFilter) {
                log.style.display = 'block';
            } else {
                log.style.display = 'none';
            }
        });
    }

    clearLogs() {
        document.getElementById('production-logs').innerHTML = '';
    }

    getElapsedTime(startTime) {
        if (!startTime) return '00:00';

        const elapsed = Date.now() - startTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }

    async refreshStatus() {
        await this.loadDevices();
        await this.loadResourcePools();
        this.updateUI();
        this.log('info', 'System', 'Status refreshed');
    }
}

// Initialize production manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.productionManager = new ProductionManager();
});