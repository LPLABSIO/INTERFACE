// Dashboard JavaScript - Session Management

let currentStatus = null;
let selectedDevices = new Set();
let activeSessions = [];
let refreshInterval = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Dashboard initialized');

    // Setup event listeners
    setupEventListeners();

    // Load initial data
    await refreshDashboard();

    // Start auto-refresh
    startAutoRefresh();

    // Subscribe to real-time updates
    subscribeToUpdates();
});

// Setup event listeners
function setupEventListeners() {
    // Control buttons
    document.getElementById('launchSessionBtn').addEventListener('click', launchNewSession);
    document.getElementById('refreshBtn').addEventListener('click', refreshDashboard);
    document.getElementById('cleanupBtn').addEventListener('click', cleanupOldSessions);
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
}

// Refresh dashboard data
async function refreshDashboard() {
    try {
        // Add spinning animation
        document.getElementById('refreshBtn').classList.add('spinning');

        // Check if electronAPI is available
        if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
            console.warn('electronAPI not fully available, using mock data');
            // Use mock data for testing
            const mockStatus = {
                devices: { total: 1, connected: 1, busy: 0 },
                sessions: { total: 0, active: 0, completed: 0, failed: 0 },
                processes: { total: 0, running: 0, crashed: 0 },
                metrics: { averageCpu: 0, totalMemory: 0 }
            };
            updateStats(mockStatus);
            updateSessionsList([]);
            updateDevicesGrid([{ udid: 'mock-device', name: 'Mock iPhone', status: 'available' }]);

            document.getElementById('lastUpdate').textContent =
                `Dernière mise à jour: ${new Date().toLocaleTimeString()} (Mode démo)`;

            addLog('Dashboard en mode démo (electronAPI non disponible)', 'warning');
            return;
        }

        // Get orchestrator status
        const status = await window.electronAPI.invoke('orchestrator:getStatus');
        if (status.error) {
            addLog('Erreur: ' + status.error, 'error');
            return;
        }

        currentStatus = status;

        // Update stats
        updateStats(status);

        // Update sessions list
        const sessions = await window.electronAPI.invoke('orchestrator:getSessions');
        updateSessionsList(sessions);

        // Update devices grid
        const devices = await window.electronAPI.invoke('orchestrator:scanDevices');
        updateDevicesGrid(devices);

        // Update last update time
        document.getElementById('lastUpdate').textContent =
            `Dernière mise à jour: ${new Date().toLocaleTimeString()}`;

        addLog('Dashboard rafraîchi', 'success');

    } catch (error) {
        console.error('Erreur rafraîchissement:', error);
        addLog('Erreur rafraîchissement: ' + error.message, 'error');
    } finally {
        // Remove spinning animation
        setTimeout(() => {
            document.getElementById('refreshBtn').classList.remove('spinning');
        }, 500);
    }
}

// Update statistics cards
function updateStats(status) {
    // Devices
    document.getElementById('totalDevices').textContent = status.devices?.total || 0;
    document.getElementById('devicesChange').textContent =
        `${status.devices?.connected || 0} connectés`;

    // Sessions
    document.getElementById('activeSessions').textContent = status.sessions?.active || 0;
    document.getElementById('sessionsChange').textContent =
        `${status.sessions?.active || 0} en cours`;

    // Success rate
    const total = status.sessions?.total || 0;
    const completed = status.sessions?.completed || 0;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    document.getElementById('successRate').textContent = `${successRate}%`;
    document.getElementById('successChange').textContent =
        successRate >= 50 ? `↑ ${successRate}%` : `↓ ${successRate}%`;
    document.getElementById('successChange').className =
        `change ${successRate >= 50 ? 'positive' : 'negative'}`;

    // CPU
    const avgCpu = Math.round(status.metrics?.averageCpu || 0);
    document.getElementById('avgCpu').textContent = `${avgCpu}%`;
    document.getElementById('cpuChange').textContent =
        avgCpu < 50 ? 'Normal' : avgCpu < 80 ? 'Élevé' : 'Critique';
    document.getElementById('cpuChange').className =
        `change ${avgCpu < 50 ? 'positive' : avgCpu < 80 ? '' : 'negative'}`;

    // RAM
    const totalRam = Math.round((status.metrics?.totalMemory || 0) / (1024 * 1024));
    document.getElementById('totalRam').textContent = `${totalRam} MB`;
    document.getElementById('ramChange').textContent =
        totalRam < 500 ? 'Stable' : totalRam < 1000 ? 'Élevée' : 'Critique';
    document.getElementById('ramChange').className =
        `change ${totalRam < 500 ? '' : totalRam < 1000 ? '' : 'negative'}`;
}

// Update sessions list
function updateSessionsList(sessions) {
    const container = document.getElementById('sessionsList');

    if (!sessions || sessions.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Aucune session active</div>';
        return;
    }

    container.innerHTML = sessions.map(session => {
        const stateClass = session.state.toLowerCase().replace('_', '-');
        const duration = session.startTime ?
            formatDuration(new Date() - new Date(session.startTime)) : '--';

        return `
            <div class="session-item" data-session-id="${session.id}">
                <div class="session-info">
                    <div class="session-id">${session.id.substring(0, 8)}...</div>
                    <div class="session-device">📱 ${session.deviceId.substring(0, 12)}...</div>
                    <span class="session-state ${stateClass}">${session.state}</span>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        Durée: ${duration} | Tentatives: ${session.retries || 0}
                    </div>
                </div>
                <div class="session-actions">
                    ${session.state === 'running' ?
                        `<button class="btn btn-primary" onclick="pauseSession('${session.id}')">⏸</button>` :
                        session.state === 'paused' ?
                        `<button class="btn btn-success" onclick="resumeSession('${session.id}')">▶</button>` : ''
                    }
                    <button class="btn btn-danger" onclick="stopSession('${session.id}')">⏹</button>
                </div>
            </div>
        `;
    }).join('');

    activeSessions = sessions;
}

// Update devices grid
function updateDevicesGrid(devices) {
    const container = document.getElementById('devicesGrid');

    if (!devices || devices.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; grid-column: 1/-1;">Aucun appareil détecté</div>';
        return;
    }

    container.innerHTML = devices.map(device => {
        const isBusy = activeSessions.some(s => s.deviceId === device.udid);
        const isSelected = selectedDevices.has(device.udid);

        return `
            <div class="device-card ${isBusy ? 'busy' : ''} ${isSelected ? 'selected' : ''}"
                 data-device-id="${device.udid}"
                 onclick="toggleDeviceSelection('${device.udid}')">
                <div class="device-icon">📱</div>
                <div class="device-name">${device.name || 'iPhone'}</div>
                <div class="device-status">${isBusy ? '🔴 Occupé' : '🟢 Disponible'}</div>
            </div>
        `;
    }).join('');
}

// Toggle device selection
function toggleDeviceSelection(deviceId) {
    const card = document.querySelector(`[data-device-id="${deviceId}"]`);

    if (card.classList.contains('busy')) {
        addLog('Cet appareil est déjà en cours d\'utilisation', 'warning');
        return;
    }

    if (selectedDevices.has(deviceId)) {
        selectedDevices.delete(deviceId);
        card.classList.remove('selected');
    } else {
        selectedDevices.add(deviceId);
        card.classList.add('selected');
    }

    // Update launch button text
    const btn = document.getElementById('launchSessionBtn');
    if (selectedDevices.size > 0) {
        btn.textContent = `🚀 Lancer (${selectedDevices.size} appareil${selectedDevices.size > 1 ? 's' : ''})`;
    } else {
        btn.textContent = '🚀 Nouvelle Session';
    }
}

// Launch new session
async function launchNewSession() {
    if (selectedDevices.size === 0) {
        addLog('Veuillez sélectionner au moins un appareil', 'warning');
        return;
    }

    // Check if API is available
    if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
        addLog('Fonction non disponible en mode démo', 'warning');
        return;
    }

    try {
        const config = {
            app: 'hinge',
            accountsNumber: 1,
            proxyProvider: 'marsproxies'
        };

        addLog(`Lancement de ${selectedDevices.size} session(s)...`, 'info');

        const result = await window.electronAPI.invoke('orchestrator:launchSession', {
            deviceIds: Array.from(selectedDevices),
            config
        });

        if (result.success) {
            addLog(`✅ ${result.sessions.length} session(s) lancée(s) avec succès`, 'success');
            selectedDevices.clear();
            await refreshDashboard();
        } else {
            addLog(`❌ Erreur: ${result.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Erreur lancement: ${error.message}`, 'error');
    }
}

// Stop session
async function stopSession(sessionId) {
    try {
        addLog(`Arrêt de la session ${sessionId.substring(0, 8)}...`, 'info');

        const result = await window.electronAPI.invoke('orchestrator:stopSession', sessionId);

        if (result.success) {
            addLog(`✅ Session arrêtée`, 'success');
            await refreshDashboard();
        } else {
            addLog(`❌ Erreur: ${result.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Erreur arrêt: ${error.message}`, 'error');
    }
}

// Pause session (to implement)
async function pauseSession(sessionId) {
    addLog('Fonction pause à implémenter', 'info');
}

// Resume session (to implement)
async function resumeSession(sessionId) {
    addLog('Fonction reprise à implémenter', 'info');
}

// Cleanup old sessions
async function cleanupOldSessions() {
    try {
        if (!confirm('Voulez-vous nettoyer les sessions de plus de 7 jours ?')) {
            return;
        }

        addLog('Nettoyage des anciennes sessions...', 'info');

        const result = await window.electronAPI.invoke('orchestrator:cleanup', 7);

        if (result.success) {
            addLog('✅ Nettoyage terminé', 'success');
            await refreshDashboard();
        } else {
            addLog(`❌ Erreur: ${result.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Erreur nettoyage: ${error.message}`, 'error');
    }
}

// Add log entry
function addLog(message, level = 'info') {
    const container = document.getElementById('logsContainer');
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    container.appendChild(entry);

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;

    // Limit log entries to 100
    while (container.children.length > 100) {
        container.removeChild(container.firstChild);
    }
}

// Format duration
function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Start auto-refresh
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        refreshDashboard();
    }, 10000); // Refresh every 10 seconds
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Subscribe to real-time updates
function subscribeToUpdates() {
    // Check if API is available
    if (!window.electronAPI || typeof window.electronAPI.on !== 'function') {
        console.warn('Cannot subscribe to updates - electronAPI not available');
        return;
    }

    // Subscribe to status updates
    window.electronAPI.on('orchestrator:status-update', (status) => {
        updateStats(status);
    });

    // Subscribe to session updates
    window.electronAPI.on('orchestrator:sessions-updated', (sessions) => {
        updateSessionsList(sessions);
    });

    // Subscribe to device updates
    window.electronAPI.on('orchestrator:devices-updated', (devices) => {
        updateDevicesGrid(devices);
    });

    // Subscribe to state changes
    window.electronAPI.on('orchestrator:state-changed', ({ path, value }) => {
        console.log('State changed:', path, value);
    });
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});