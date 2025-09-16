// État global de l'application
const appState = {
    devices: new Map(),
    selectedDevice: null,
    selectedDevices: new Set(), // Pour la sélection multiple
    processes: new Map(),
    logs: {
        script: [],
        appium: [],
        system: []
    },
    settings: {
        appiumBasePort: 1265,
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

    // Initialiser les améliorations UI si disponibles
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

    // Afficher les logs système par défaut
    switchTab('system');
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
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', () => {
            showModal('settings-modal');
        });
    }

    const modalClose = document.querySelector('.modal-close');
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            hideModal('settings-modal');
        });
    }

    const cancelSettings = document.getElementById('cancel-settings');
    if (cancelSettings) {
        cancelSettings.addEventListener('click', () => {
            hideModal('settings-modal');
        });
    }

    const saveSettings = document.getElementById('save-settings');
    if (saveSettings) {
        saveSettings.addEventListener('click', saveSettingsHandler);
    }

    // Start/Stop bot
    if (elements.startBotBtn) {
        elements.startBotBtn.addEventListener('click', startBot);
    }

    if (elements.stopBotBtn) {
        elements.stopBotBtn.addEventListener('click', stopBot);
    }

    // Logs controls
    if (elements.clearLogsBtn) {
        elements.clearLogsBtn.addEventListener('click', clearLogs);
    }

    if (elements.exportLogsBtn) {
        elements.exportLogsBtn.addEventListener('click', exportLogs);
    }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.dataset.tab);
        });
    });

    // Modal backdrop click
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                hideModal('settings-modal');
            }
        });
    }
}

// IPC Communication
function initializeIPC() {
    // Recevoir les mises à jour des appareils
    window.electronAPI.onDeviceUpdate((devices) => {
        console.log('Device update received via IPC:', devices);
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

    // Recevoir les mises à jour de statut des services
    window.electronAPI.onServiceStatusUpdate((data) => {
        updateServiceStatus(data.service, data.status);
    });

    // Recevoir les statistiques
    window.electronAPI.onStatsUpdate((data) => {
        updateStats(data);
    });

    // Démarrer le système de vérification périodique des statuts
    startStatusPolling();
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

        // Mettre à jour la liste des appareils
        updateDeviceList(devices);

        // Notification de succès
        if (window.UIEnhancements) {
            if (devices && devices.length > 0) {
                window.UIEnhancements.showNotification(`${devices.length} appareil(s) détecté(s)`, 'success');
            } else {
                window.UIEnhancements.showNotification('Aucun appareil détecté', 'warning');
            }
        }

        addLog('system', `Scan terminé: ${devices.length} appareil(s) trouvé(s)`, 'success');
    } catch (error) {
        console.error('Error scanning devices:', error);
        addLog('system', `Erreur lors du scan: ${error.message}`, 'error');
        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification(`Erreur: ${error.message}`, 'error');
        }
    } finally {
        elements.scanDevicesBtn.disabled = false;
        elements.scanDevicesBtn.innerHTML = '<span class="icon">🔍</span> Scanner les appareils';
    }
}

function updateDeviceList(devices) {
    console.log('updateDeviceList called with:', devices);

    if (!devices || !Array.isArray(devices)) {
        console.error('Invalid devices data:', devices);
        return;
    }

    // Vider la Map actuelle et la remplir avec les nouveaux appareils
    appState.devices.clear();
    devices.forEach(device => {
        appState.devices.set(device.udid, device);
    });

    // Mettre à jour le compteur
    if (elements.deviceCount) {
        elements.deviceCount.textContent = devices.length;
        console.log('Updated device count to:', devices.length);
    }

    // Mettre à jour la liste visuelle
    if (elements.deviceList) {
        elements.deviceList.innerHTML = '';

        if (devices.length === 0) {
            elements.deviceList.innerHTML = `
                <div class="empty-state">
                    <p>Aucun appareil détecté</p>
                    <small>Connectez un appareil iOS et cliquez sur Scanner</small>
                </div>
            `;
        } else {
            devices.forEach(device => {
                const deviceElement = createDeviceElement(device);
                elements.deviceList.appendChild(deviceElement);
            });

            // Si aucun appareil n'est sélectionné, sélectionner le premier
            if (!appState.selectedDevice && devices.length > 0) {
                selectDevice(devices[0].udid);
            }
        }
    }
}

function createDeviceElement(device) {
    const div = document.createElement('div');
    const isSelected = appState.selectedDevices.has(device.udid);
    div.className = `device-item${isSelected ? ' selected' : ''}`;
    div.dataset.udid = device.udid;

    const statusClass = device.status === 'online' ? 'online' : 'offline';
    const isChecked = isSelected ? 'checked' : '';

    div.innerHTML = `
        <input type="checkbox" class="device-checkbox" ${isChecked} data-udid="${device.udid}">
        <div class="device-item-icon">📱</div>
        <div class="device-item-info">
            <div class="device-item-name">${device.name || 'iPhone'}</div>
            <div class="device-item-udid">${device.udid.substring(0, 8)}...</div>
        </div>
        <div class="device-item-status ${statusClass}"></div>
    `;

    // Gérer le clic sur la checkbox
    const checkbox = div.querySelector('.device-checkbox');
    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        toggleDeviceSelection(device.udid, e.target.checked);

        // Mettre à jour la classe selected
        div.classList.toggle('selected', e.target.checked);
    });

    // Gérer le clic sur l'item (pour afficher les détails)
    div.addEventListener('click', (e) => {
        if (e.target.type !== 'checkbox') {
            selectDevice(device.udid);
        }
    });

    return div;
}

function toggleDeviceSelection(udid, isChecked) {
    if (isChecked) {
        appState.selectedDevices.add(udid);
    } else {
        appState.selectedDevices.delete(udid);
    }

    // Mettre à jour le texte du bouton de lancement
    updateLaunchButtonText();

    console.log('Selected devices:', Array.from(appState.selectedDevices));
}

function updateLaunchButtonText() {
    const launchBtn = document.getElementById('launch-bot-btn');
    if (launchBtn) {
        const count = appState.selectedDevices.size;
        if (count === 0) {
            launchBtn.textContent = 'Sélectionnez des appareils';
            launchBtn.disabled = true;
        } else if (count === 1) {
            launchBtn.textContent = 'Démarrer le bot (1 appareil)';
            launchBtn.disabled = false;
        } else {
            launchBtn.textContent = `Démarrer les bots (${count} appareils)`;
            launchBtn.disabled = false;
        }
    }
}

function selectDevice(udid) {
    console.log('Selecting device:', udid);

    // Mettre à jour l'état
    appState.selectedDevice = udid;

    // Mettre à jour l'UI de la liste
    document.querySelectorAll('.device-item').forEach(item => {
        item.classList.toggle('active', item.dataset.udid === udid);
    });

    // Afficher les détails de l'appareil
    const device = appState.devices.get(udid);
    if (device) {
        showDeviceDetails(device);
    }
}

function showDeviceDetails(device) {
    console.log('Showing device details:', device);

    // Cacher le message "no device selected"
    if (elements.noDeviceSelected) {
        elements.noDeviceSelected.style.display = 'none';
    }

    // Afficher les détails
    if (elements.deviceDetail) {
        elements.deviceDetail.style.display = 'block';

        // Mettre à jour les informations
        const deviceName = document.getElementById('device-name');
        const deviceUdid = document.getElementById('device-udid');
        const appiumPort = document.getElementById('appium-port');
        const wdaPort = document.getElementById('wda-port');

        if (deviceName) deviceName.textContent = device.name || 'iPhone';
        if (deviceUdid) deviceUdid.textContent = `UDID: ${device.udid}`;
        if (appiumPort) appiumPort.textContent = device.appiumPort || appState.settings.appiumBasePort;
        if (wdaPort) wdaPort.textContent = device.wdaPort || appState.settings.wdaBasePort;

        // Mettre à jour le statut
        updateDeviceStatus(device.udid, device.status || 'online');
    }
}

function updateDeviceStatus(udid, status) {
    const device = appState.devices.get(udid);
    if (!device) return;

    device.status = status;

    // Mettre à jour dans la liste
    const deviceElement = document.querySelector(`.device-item[data-udid="${udid}"]`);
    if (deviceElement) {
        const statusElement = deviceElement.querySelector('.device-item-status');
        if (statusElement) {
            statusElement.className = `device-item-status ${status}`;
        }
    }

    // Mettre à jour dans les détails si c'est l'appareil sélectionné
    if (appState.selectedDevice === udid) {
        const statusText = document.querySelector('.status-text');
        const statusIndicator = document.querySelector('.status-indicator');

        if (statusText && statusIndicator) {
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
        }

        // Mettre à jour les boutons
        const isRunning = status === 'running';
        if (elements.startBotBtn) elements.startBotBtn.style.display = isRunning ? 'none' : 'flex';
        if (elements.stopBotBtn) elements.stopBotBtn.style.display = isRunning ? 'flex' : 'none';
    }
}

// Fonctions pour le contrôle du bot
async function startBot() {
    // Vérifier qu'au moins un appareil est sélectionné
    if (appState.selectedDevices.size === 0) {
        addLog('system', 'Aucun appareil sélectionné', 'error');
        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification('Veuillez sélectionner au moins un appareil', 'warning');
        }
        return;
    }

    const selectedUdids = Array.from(appState.selectedDevices);

    try {
        elements.startBotBtn.disabled = true;
        const deviceCount = selectedUdids.length;
        const message = deviceCount === 1 ? 'Démarrage du bot...' : `Démarrage de ${deviceCount} bots...`;

        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification(message, 'info');
        }

        addLog('system', `Lancement sur ${deviceCount} appareil(s)`, 'info');

        // Lancer un bot pour chaque appareil sélectionné
        let portOffset = 0;
        for (const udid of selectedUdids) {
            const device = appState.devices.get(udid);
            if (!device) continue;

            // Assigner des ports uniques
            device.appiumPort = appState.settings.appiumBasePort + portOffset;
            device.wdaPort = appState.settings.wdaBasePort + portOffset;

            addLog('system', `[${device.name}] Démarrage d'Appium sur le port ${device.appiumPort}...`, 'info');
            updateServiceStatus('appium', 'starting');

            await window.electronAPI.startAppium({
                udid: device.udid,
                port: device.appiumPort,
                wdaPort: device.wdaPort
            });

            addLog('system', `[${device.name}] Appium démarré avec succès`, 'success');

            // Démarrer WDA
            addLog('system', `[${device.name}] Démarrage de WebDriverAgent sur le port ${device.wdaPort}...`, 'info');

            await window.electronAPI.startWDA({
                udid: device.udid,
                port: device.wdaPort
            });

            addLog('system', `[${device.name}] WebDriverAgent démarré avec succès`, 'success');

            // Démarrer le bot
            addLog('system', `[${device.name}] Démarrage du bot ${appState.settings.app}...`, 'info');

            await window.electronAPI.startBot({
                udid: device.udid,
                deviceName: device.name || 'iPhone',
                app: appState.settings.app,
                appiumPort: device.appiumPort,
                wdaPort: device.wdaPort,
                accountsNumber: appState.settings.accountsNumber,
                proxyProvider: appState.settings.proxyProvider
            });

            addLog('system', `[${device.name}] Bot démarré avec succès`, 'success');
            updateDeviceStatus(device.udid, 'running');

            // Incrémenter le port offset pour le prochain appareil
            portOffset++;
        }

        // Mettre à jour les statuts globaux après avoir lancé tous les bots
        updateServiceStatus('script', 'running');

        const successMessage = selectedUdids.length === 1
            ? 'Bot démarré avec succès!'
            : `${selectedUdids.length} bots démarrés avec succès!`;

        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification(successMessage, 'success');
        }

        elements.startBotBtn.style.display = 'none';
        elements.stopBotBtn.style.display = 'inline-block';

    } catch (error) {
        console.error('Erreur lors du démarrage:', error);
        addLog('system', `Erreur: ${error.message}`, 'error');
        elements.startBotBtn.disabled = false;

        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification(`Erreur: ${error.message}`, 'error');
        }
    } finally {
        elements.startBotBtn.disabled = false;
    }
}

async function stopBot() {
    if (!appState.selectedDevice) {
        console.log('Pas d\'appareil sélectionné pour stopBot');
        return;
    }

    try {
        console.log('Arrêt du bot pour:', appState.selectedDevice);
        elements.stopBotBtn.disabled = true;

        const result = await window.electronAPI.stopBot({
            udid: appState.selectedDevice
        });

        console.log('Résultat stopBot:', result);

        // Mettre à jour les statuts même si l'arrêt a partiellement échoué
        updateServiceStatus('script', 'stopped');
        updateServiceStatus('wda', 'stopped');
        updateServiceStatus('appium', 'stopped');
        updateDeviceStatus(appState.selectedDevice, 'online');

        if (result && result.success) {
            addLog('system', 'Bot arrêté avec succès', 'success');
        } else if (result && result.error) {
            addLog('system', `Bot arrêté avec avertissement: ${result.error}`, 'warning');
        }

    } catch (error) {
        console.error('Erreur lors de l\'arrêt:', error);
        addLog('system', `Erreur: ${error.message || 'Erreur inconnue'}`, 'error');

        // Réinitialiser l'interface même en cas d'erreur
        updateServiceStatus('script', 'stopped');
        updateServiceStatus('wda', 'stopped');
        updateServiceStatus('appium', 'stopped');
        updateDeviceStatus(appState.selectedDevice, 'online');
    } finally {
        if (elements.stopBotBtn) {
            elements.stopBotBtn.disabled = false;
        }
    }
}

// Fonctions pour les logs
function addLog(type, message, level = 'info') {
    console.log(`[LOG ${type}] ${level}: ${message}`);
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, level };

    // Ajouter au tableau approprié
    if (appState.logs[type]) {
        appState.logs[type].push(logEntry);
        // Limiter à 1000 entrées
        if (appState.logs[type].length > 1000) {
            appState.logs[type].shift();
        }
    }

    // Mettre à jour l'affichage si c'est le tab actif
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset && activeTab.dataset.tab === type) {
        appendLogToView(logEntry);
    }
}

function appendLogToView(logEntry) {
    const logsContainer = document.getElementById('logs-container');
    if (!logsContainer) return;

    const logElement = document.createElement('div');
    logElement.className = `log-entry log-${logEntry.level}`;
    logElement.innerHTML = `
        <span class="log-time">${logEntry.timestamp}</span>
        <span class="log-message">${logEntry.message}</span>
    `;

    logsContainer.appendChild(logElement);

    // Auto-scroll si activé avec un léger délai pour voir l'animation
    if (elements.autoScrollCheckbox && elements.autoScrollCheckbox.checked) {
        // Utiliser requestAnimationFrame pour un scroll plus fluide
        requestAnimationFrame(() => {
            logsContainer.scrollTo({
                top: logsContainer.scrollHeight,
                behavior: 'smooth'
            });
        });
    }
}

function clearLogs() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        const tabType = activeTab.dataset.tab;
        appState.logs[tabType] = [];
        const logsContainer = document.getElementById('logs-container');
        if (logsContainer) {
            logsContainer.innerHTML = '';
        }
    }
}

function exportLogs() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        const tabType = activeTab.dataset.tab;
        const logs = appState.logs[tabType];
        const content = logs.map(log => `${log.timestamp} [${log.level}] ${log.message}`).join('\n');

        // Créer un blob et télécharger
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${tabType}-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

function switchTab(tabType) {
    // Mettre à jour les boutons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabType);
    });

    // Afficher les logs du type sélectionné
    const logsContainer = document.getElementById('logs-container');
    if (logsContainer) {
        logsContainer.innerHTML = '';
        const logs = appState.logs[tabType] || [];
        logs.forEach(log => appendLogToView(log));
    }
}

// Variables pour le polling des statuts
let statusPollingInterval = null;
let servicesStatus = {
    script: 'inactive',
    appium: 'stopped',
    wda: 'stopped'
};

// Fonction pour démarrer le polling des statuts
function startStatusPolling() {
    // Arrêter le polling existant s'il y en a un
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
    }

    // Vérifier immédiatement au démarrage
    checkServicesStatus();

    // Puis vérifier toutes les 2 secondes
    statusPollingInterval = setInterval(checkServicesStatus, 2000);
}

// Fonction pour arrêter le polling
function stopStatusPolling() {
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
    }
}

// Fonction pour vérifier le statut des services
async function checkServicesStatus() {
    try {
        // Vérifier le statut via l'API Electron
        if (window.electronAPI && window.electronAPI.checkServicesStatus) {
            const statuses = await window.electronAPI.checkServicesStatus();

            // Mettre à jour uniquement si les statuts ont changé
            if (statuses.script !== servicesStatus.script) {
                servicesStatus.script = statuses.script;
                updateServiceStatus('script', statuses.script);
            }

            if (statuses.appium !== servicesStatus.appium) {
                servicesStatus.appium = statuses.appium;
                updateServiceStatus('appium', statuses.appium);
            }

            if (statuses.wda !== servicesStatus.wda) {
                servicesStatus.wda = statuses.wda;
                updateServiceStatus('wda', statuses.wda);
            }
        }
    } catch (error) {
        console.error('Erreur lors de la vérification des statuts:', error);
    }
}

// Fonctions pour les services
function updateServiceStatus(service, status) {
    // Mapper les services aux IDs corrects dans le HTML
    const serviceIdMap = {
        'script': 'script-status',
        'appium': 'appium-status',
        'wda': 'wda-status'
    };

    const elementId = serviceIdMap[service];
    if (!elementId) return;

    const statusElement = document.getElementById(elementId);
    if (statusElement) {
        // Mapper les statuts aux textes et classes appropriés
        let displayText = '';
        let badgeClass = 'badge-inactive';

        switch (status) {
            case 'running':
                displayText = 'En cours';
                badgeClass = 'badge-active';
                break;
            case 'starting':
                displayText = 'Démarrage...';
                badgeClass = 'badge-warning';
                break;
            case 'stopping':
                displayText = 'Arrêt...';
                badgeClass = 'badge-warning';
                break;
            case 'stopped':
            case 'inactive':
                displayText = service === 'script' ? 'Inactif' : 'Arrêté';
                badgeClass = 'badge-inactive';
                break;
            case 'error':
                displayText = 'Erreur';
                badgeClass = 'badge-error';
                break;
            default:
                displayText = status;
                badgeClass = 'badge-inactive';
        }

        statusElement.textContent = displayText;
        statusElement.className = `status-badge ${badgeClass}`;

        // Mettre à jour les ports si nécessaire
        if (service === 'appium') {
            const portElement = document.getElementById('appium-port');
            if (portElement && status === 'running' && appState.selectedDevices.size > 0) {
                const firstDevice = appState.devices.get(Array.from(appState.selectedDevices)[0]);
                if (firstDevice) {
                    portElement.textContent = firstDevice.appiumPort || appState.settings.appiumBasePort;
                }
            } else if (portElement && status !== 'running') {
                portElement.textContent = '-';
            }
        }

        if (service === 'wda') {
            const portElement = document.getElementById('wda-port');
            if (portElement && status === 'running' && appState.selectedDevices.size > 0) {
                const firstDevice = appState.devices.get(Array.from(appState.selectedDevices)[0]);
                if (firstDevice) {
                    portElement.textContent = firstDevice.wdaPort || appState.settings.wdaBasePort;
                }
            } else if (portElement && status !== 'running') {
                portElement.textContent = '-';
            }
        }
    }
}

// Fonctions pour les paramètres
function saveSettingsHandler() {
    const settings = {
        appiumBasePort: parseInt(document.getElementById('appium-base-port').value),
        wdaBasePort: parseInt(document.getElementById('wda-base-port').value),
        app: document.getElementById('app-select').value,
        accountsNumber: parseInt(document.getElementById('accounts-number').value),
        proxyProvider: document.getElementById('proxy-provider').value
    };

    appState.settings = settings;
    window.electronAPI.saveSettings(settings);
    hideModal('settings-modal');
    addLog('system', 'Paramètres sauvegardés', 'success');
}

// Fonctions pour les modals
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Charger les valeurs actuelles
        if (modalId === 'settings-modal') {
            document.getElementById('appium-base-port').value = appState.settings.appiumBasePort;
            document.getElementById('wda-base-port').value = appState.settings.wdaBasePort;
            document.getElementById('app-select').value = appState.settings.app;
            document.getElementById('accounts-number').value = appState.settings.accountsNumber;
            document.getElementById('proxy-provider').value = appState.settings.proxyProvider;
        }
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Fonctions pour les statistiques
function updateStats(stats) {
    if (stats.matches !== undefined) {
        const matchesElement = document.getElementById('matches-count');
        if (matchesElement) matchesElement.textContent = stats.matches;
    }

    if (stats.messages !== undefined) {
        const messagesElement = document.getElementById('messages-count');
        if (messagesElement) messagesElement.textContent = stats.messages;
    }

    if (stats.uptime !== undefined) {
        const uptimeElement = document.getElementById('uptime');
        if (uptimeElement) uptimeElement.textContent = formatUptime(stats.uptime);
    }
}

function formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
}

// Export pour debug
window.appState = appState;
window.scanDevices = scanDevices;