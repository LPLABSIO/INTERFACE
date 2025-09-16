// État global de l'application
const state = {
    devices: new Map(),
    selectedDevice: null,
    processes: new Map(),
    logs: {
        script: [],
        appium: [],
        system: []
    },
    settings: {
        appiumBasePort: 4723,
        wdaBasePort: 8100,
        app: 'hinge',
        accountsNumber: 1,
        proxyProvider: 'marsproxies'
    }
};

// Éléments DOM
const elements = {
    deviceList: document.getElementById('device-list'),
    deviceCount: document.getElementById('device-count'),
    noDeviceSelected: document.getElementById('no-device-selected'),
    deviceDetail: document.getElementById('device-detail'),
    scanDevicesBtn: document.getElementById('scan-devices'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    startBotBtn: document.getElementById('start-bot'),
    stopBotBtn: document.getElementById('stop-bot'),
    clearLogsBtn: document.getElementById('clear-logs'),
    exportLogsBtn: document.getElementById('export-logs'),
    autoScrollCheckbox: document.getElementById('auto-scroll')
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded - Starting initialization...');

    // Initialiser les améliorations UI
    if (window.UIEnhancements) {
        console.log('Initializing UI enhancements...');
        window.UIEnhancements.initializeErrorHandling();
        window.UIEnhancements.initializeNotifications();
    }

    console.log('Initializing event listeners...');
    initializeEventListeners();
    console.log('Initializing IPC...');
    initializeIPC();
    console.log('Running initial device scan...');
    scanDevices();
});

// Event Listeners
function initializeEventListeners() {
    // Scan devices button
    console.log('Setting up scan button listener, button element:', elements.scanDevicesBtn);
    if (elements.scanDevicesBtn) {
        elements.scanDevicesBtn.addEventListener('click', () => {
            console.log('Scan button clicked!');
            scanDevices();
        });
    } else {
        console.error('Scan button not found!');
    }

    // Settings modal
    elements.settingsBtn.addEventListener('click', () => {
        showModal('settings-modal');
    });

    document.querySelector('.modal-close').addEventListener('click', () => {
        hideModal('settings-modal');
    });

    document.getElementById('cancel-settings').addEventListener('click', () => {
        hideModal('settings-modal');
    });

    document.getElementById('save-settings').addEventListener('click', saveSettings);

    // Start/Stop bot
    elements.startBotBtn.addEventListener('click', startBot);
    elements.stopBotBtn.addEventListener('click', stopBot);

    // Logs controls
    elements.clearLogsBtn.addEventListener('click', clearLogs);
    elements.exportLogsBtn.addEventListener('click', exportLogs);

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Modal backdrop click
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            hideModal('settings-modal');
        }
    });
}

// IPC Communication
function initializeIPC() {
    // Recevoir les mises à jour des appareils
    window.electronAPI.onDeviceUpdate((devices) => {
        updateDeviceList(devices);
    });

    // Recevoir les logs du script
    window.electronAPI.onScriptLog((data) => {
        addLog('script', data.message, data.level);
    });

    // Recevoir les logs d'Appium
    window.electronAPI.onAppiumLog((data) => {
        addLog('appium', data.message, data.level);
    });

    // Recevoir les logs système
    window.electronAPI.onSystemLog((data) => {
        addLog('system', data.message, data.level);
    });

    // Recevoir les mises à jour de statut
    window.electronAPI.onStatusUpdate((data) => {
        updateDeviceStatus(data.deviceId, data.status);
    });

    // Recevoir les statistiques
    window.electronAPI.onStatsUpdate((data) => {
        updateStats(data);
    });
}

// Fonctions pour la gestion des appareils
async function scanDevices() {
    console.log('scanDevices called');
    try {
        elements.scanDevicesBtn.disabled = true;
        elements.scanDevicesBtn.textContent = 'Scan en cours...';

        console.log('Calling window.electronAPI.scanDevices()...');
        const devices = await window.electronAPI.scanDevices();
        console.log('Devices received:', devices);
        updateDeviceList(devices);

        addLog('system', `Scan terminé: ${devices.length} appareil(s) trouvé(s)`, 'success');
    } catch (error) {
        addLog('system', `Erreur lors du scan: ${error.message}`, 'error');
    } finally {
        elements.scanDevicesBtn.disabled = false;
        elements.scanDevicesBtn.innerHTML = '<span class="icon">🔍</span> Scanner les appareils';
    }
}

function updateDeviceList(devices) {
    state.devices.clear();
    elements.deviceList.innerHTML = '';

    devices.forEach((device, index) => {
        state.devices.set(device.udid, device);

        const deviceElement = createDeviceElement(device, index);
        elements.deviceList.appendChild(deviceElement);
    });

    elements.deviceCount.textContent = devices.length;

    // Sélectionner le premier appareil si aucun n'est sélectionné
    if (!state.selectedDevice && devices.length > 0) {
        selectDevice(devices[0].udid);
    }
}

function createDeviceElement(device, index) {
    const div = document.createElement('div');
    div.className = 'device-item';
    div.dataset.udid = device.udid;

    // Assigner les ports pour cet appareil
    device.appiumPort = state.settings.appiumBasePort + index;
    device.wdaPort = state.settings.wdaBasePort + index;

    div.innerHTML = `
        <div class="device-item-header">
            <span class="device-item-name">${device.name || `iPhone ${index + 1}`}</span>
            <span class="device-item-status ${device.status || 'offline'}"></span>
        </div>
        <div class="device-item-info">
            <div>UDID: ${device.udid.substring(0, 8)}...</div>
            <div>Ports: ${device.appiumPort} / ${device.wdaPort}</div>
        </div>
    `;

    div.addEventListener('click', () => selectDevice(device.udid));

    return div;
}

function selectDevice(udid) {
    const device = state.devices.get(udid);
    if (!device) return;

    state.selectedDevice = udid;

    // Mettre à jour l'interface
    document.querySelectorAll('.device-item').forEach(item => {
        item.classList.toggle('active', item.dataset.udid === udid);
    });

    // Afficher les détails de l'appareil
    showDeviceDetail(device);
}

function showDeviceDetail(device) {
    elements.noDeviceSelected.style.display = 'none';
    elements.deviceDetail.style.display = 'flex';

    // Mettre à jour les informations
    document.getElementById('device-name').textContent = device.name || 'iPhone';
    document.getElementById('device-udid').textContent = `UDID: ${device.udid}`;
    document.getElementById('appium-port').textContent = device.appiumPort;
    document.getElementById('wda-port').textContent = device.wdaPort;

    // Mettre à jour le statut
    updateDeviceStatus(device.udid, device.status || 'disconnected');
}

function updateDeviceStatus(udid, status) {
    const device = state.devices.get(udid);
    if (!device) return;

    device.status = status;

    // Mettre à jour dans la liste
    const deviceElement = document.querySelector(`.device-item[data-udid="${udid}"]`);
    if (deviceElement) {
        const statusElement = deviceElement.querySelector('.device-item-status');
        statusElement.className = `device-item-status ${status}`;
    }

    // Mettre à jour dans les détails si c'est l'appareil sélectionné
    if (state.selectedDevice === udid) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');

        switch (status) {
            case 'online':
                statusText.textContent = 'Connecté';
                statusIndicator.style.background = 'var(--success-color)';
                break;
            case 'running':
                statusText.textContent = 'En cours';
                statusIndicator.style.background = 'var(--warning-color)';
                break;
            case 'error':
                statusText.textContent = 'Erreur';
                statusIndicator.style.background = 'var(--danger-color)';
                break;
            default:
                statusText.textContent = 'Déconnecté';
                statusIndicator.style.background = 'var(--secondary-color)';
        }

        // Mettre à jour les boutons
        const isRunning = status === 'running';
        elements.startBotBtn.style.display = isRunning ? 'none' : 'flex';
        elements.stopBotBtn.style.display = isRunning ? 'flex' : 'none';
    }
}

// Fonctions pour le contrôle du bot
async function startBot() {
    if (!state.selectedDevice) {
        addLog('system', 'Aucun appareil sélectionné', 'error');
        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification('Veuillez sélectionner un appareil', 'warning');
        }
        return;
    }

    const device = state.devices.get(state.selectedDevice);

    try {
        elements.startBotBtn.disabled = true;
        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification('Démarrage du bot...', 'info');
        }

        // Démarrer Appium
        addLog('system', `Démarrage d'Appium sur le port ${device.appiumPort}...`, 'info');
        updateServiceStatus('appium', 'starting');

        await window.electronAPI.startAppium({
            udid: device.udid,
            port: device.appiumPort,
            wdaPort: device.wdaPort
        });

        updateServiceStatus('appium', 'running');
        addLog('system', 'Appium démarré avec succès', 'success');

        // Démarrer WDA
        addLog('system', `Démarrage de WebDriverAgent sur le port ${device.wdaPort}...`, 'info');
        updateServiceStatus('wda', 'starting');

        await window.electronAPI.startWDA({
            udid: device.udid,
            port: device.wdaPort
        });

        updateServiceStatus('wda', 'running');
        addLog('system', 'WebDriverAgent démarré avec succès', 'success');

        // Démarrer le bot
        addLog('system', `Démarrage du bot ${state.settings.app}...`, 'info');
        updateServiceStatus('script', 'starting');

        await window.electronAPI.startBot({
            udid: device.udid,
            deviceName: device.name || 'iPhone',
            app: state.settings.app,
            appiumPort: device.appiumPort,
            wdaPort: device.wdaPort,
            accountsNumber: state.settings.accountsNumber,
            proxyProvider: state.settings.proxyProvider
        });

        updateServiceStatus('script', 'running');
        updateDeviceStatus(device.udid, 'running');
        addLog('system', 'Bot démarré avec succès', 'success');

    } catch (error) {
        addLog('system', `Erreur lors du démarrage: ${error.message}`, 'error');
        updateDeviceStatus(device.udid, 'error');
    } finally {
        elements.startBotBtn.disabled = false;
    }
}

async function stopBot() {
    if (!state.selectedDevice) return;

    const device = state.devices.get(state.selectedDevice);

    try {
        elements.stopBotBtn.disabled = true;

        addLog('system', 'Arrêt du bot...', 'info');

        await window.electronAPI.stopBot({
            udid: device.udid
        });

        updateServiceStatus('script', 'stopped');
        updateServiceStatus('appium', 'stopped');
        updateServiceStatus('wda', 'stopped');
        updateDeviceStatus(device.udid, 'online');

        addLog('system', 'Bot arrêté avec succès', 'success');

    } catch (error) {
        addLog('system', `Erreur lors de l'arrêt: ${error.message}`, 'error');
    } finally {
        elements.stopBotBtn.disabled = false;
    }
}

function updateServiceStatus(service, status) {
    let badge, text;

    switch (service) {
        case 'script':
            badge = document.getElementById('script-status');
            text = document.getElementById('script-details').querySelector('small');
            break;
        case 'appium':
            badge = document.getElementById('appium-status');
            break;
        case 'wda':
            badge = document.getElementById('wda-status');
            break;
    }

    if (!badge) return;

    // Supprimer toutes les classes de badge
    badge.className = 'status-badge';

    switch (status) {
        case 'running':
            badge.classList.add('badge-active');
            badge.textContent = 'Actif';
            if (text && service === 'script') {
                text.textContent = `Exécution de ${state.settings.app}`;
            }
            break;
        case 'starting':
            badge.classList.add('badge-running');
            badge.textContent = 'Démarrage...';
            break;
        case 'stopped':
            badge.classList.add('badge-inactive');
            badge.textContent = 'Arrêté';
            if (text && service === 'script') {
                text.textContent = 'Aucun script en cours';
            }
            break;
        case 'error':
            badge.classList.add('badge-error');
            badge.textContent = 'Erreur';
            break;
    }
}

// Fonctions pour les logs
function addLog(type, message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
        timestamp,
        message,
        level
    };

    // Ajouter au state
    state.logs[type].push(logEntry);

    // Limiter la taille des logs
    if (state.logs[type].length > 1000) {
        state.logs[type].shift();
    }

    // Afficher si c'est l'onglet actif
    const panel = document.getElementById(`${type}-logs`);
    if (panel && panel.classList.contains('active')) {
        const logContent = panel.querySelector('.log-content');
        const logElement = createLogElement(logEntry);
        logContent.appendChild(logElement);

        // Auto-scroll si activé
        if (elements.autoScrollCheckbox.checked) {
            logContent.scrollTop = logContent.scrollHeight;
        }
    }
}

function createLogElement(logEntry) {
    const div = document.createElement('div');
    div.className = `log-entry ${logEntry.level}`;
    div.innerHTML = `
        <span class="log-timestamp">[${logEntry.timestamp}]</span>
        <span class="log-message">${escapeHtml(logEntry.message)}</span>
    `;
    return div;
}

function clearLogs() {
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    const type = activeTab.replace('-logs', '');

    state.logs[type] = [];

    const panel = document.getElementById(activeTab);
    if (panel) {
        panel.querySelector('.log-content').innerHTML = '';
    }

    addLog('system', `Logs ${type} effacés`, 'info');
}

function exportLogs() {
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    const type = activeTab.replace('-logs', '');
    const logs = state.logs[type];

    if (logs.length === 0) {
        addLog('system', 'Aucun log à exporter', 'warning');
        return;
    }

    const content = logs.map(log =>
        `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    addLog('system', `Logs ${type} exportés`, 'success');
}

function switchTab(tabName) {
    // Mettre à jour les boutons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Mettre à jour les panels
    document.querySelectorAll('.log-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === tabName);
    });

    // Charger les logs si nécessaire
    const type = tabName.replace('-logs', '');
    const panel = document.getElementById(tabName);
    const logContent = panel.querySelector('.log-content');

    // Vider et recharger les logs
    logContent.innerHTML = '';
    state.logs[type].forEach(logEntry => {
        logContent.appendChild(createLogElement(logEntry));
    });

    if (elements.autoScrollCheckbox.checked) {
        logContent.scrollTop = logContent.scrollHeight;
    }
}

// Fonctions pour les paramètres
function saveSettings() {
    state.settings.appiumBasePort = parseInt(document.getElementById('appium-base-port').value);
    state.settings.wdaBasePort = parseInt(document.getElementById('wda-base-port').value);
    state.settings.app = document.getElementById('app-select').value;
    state.settings.accountsNumber = parseInt(document.getElementById('accounts-number').value);
    state.settings.proxyProvider = document.getElementById('proxy-provider').value;

    // Sauvegarder via IPC
    window.electronAPI.saveSettings(state.settings);

    // Réassigner les ports aux appareils
    let index = 0;
    state.devices.forEach(device => {
        device.appiumPort = state.settings.appiumBasePort + index;
        device.wdaPort = state.settings.wdaBasePort + index;
        index++;
    });

    // Mettre à jour l'affichage
    if (state.selectedDevice) {
        const device = state.devices.get(state.selectedDevice);
        document.getElementById('appium-port').textContent = device.appiumPort;
        document.getElementById('wda-port').textContent = device.wdaPort;
    }

    hideModal('settings-modal');
    addLog('system', 'Paramètres sauvegardés', 'success');
}

function updateStats(stats) {
    document.getElementById('accounts-created').textContent = stats.accountsCreated || 0;
    document.getElementById('success-rate').textContent = stats.successRate ?
        `${stats.successRate}%` : '-';
}

// Fonctions utilitaires
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}