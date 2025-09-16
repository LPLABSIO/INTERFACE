/**
 * Interface Améliorée - JavaScript Principal
 * Version 2.0 avec UX/UI optimisée
 */

// ===============================================
// GESTIONNAIRE DE NAVIGATION
// ===============================================

class NavigationManager {
    constructor() {
        this.currentView = 'devices';
        this.views = ['devices', 'control', 'queue', 'reports'];
        this.init();
    }

    init() {
        // Gérer les clicks sur les tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.switchView(view);
            });
        });
    }

    switchView(viewName) {
        if (!this.views.includes(viewName)) return;

        // Mettre à jour les tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.view === viewName);
        });

        // Mettre à jour les vues
        document.querySelectorAll('.main-view').forEach(view => {
            view.style.display = 'none';
        });

        const targetView = document.getElementById(`view-${viewName}`);
        if (targetView) {
            targetView.style.display = 'block';
            targetView.classList.add('animate-fadeIn');
        }

        this.currentView = viewName;

        // Émettre un événement de changement de vue
        window.dispatchEvent(new CustomEvent('viewChanged', { detail: { view: viewName } }));
    }
}

// ===============================================
// GESTIONNAIRE DE NOTIFICATIONS
// ===============================================

class NotificationManager {
    constructor() {
        this.container = document.getElementById('notification-container');
        this.notifications = new Map();
    }

    show(message, type = 'info', duration = 5000) {
        const id = Date.now();
        const notification = this.createNotification(id, message, type);

        this.container.appendChild(notification);
        this.notifications.set(id, notification);

        // Animation d'entrée
        setTimeout(() => notification.classList.add('show'), 10);

        // Auto-fermeture
        if (duration > 0) {
            setTimeout(() => this.close(id), duration);
        }

        return id;
    }

    createNotification(id, message, type) {
        const div = document.createElement('div');
        div.className = `notification notification-${type}`;
        div.innerHTML = `
            <span class="notification-icon">${this.getIcon(type)}</span>
            <span class="notification-message">${message}</span>
            <button class="notification-close" data-id="${id}">×</button>
        `;

        div.querySelector('.notification-close').addEventListener('click', () => {
            this.close(id);
        });

        return div;
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    close(id) {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
                this.notifications.delete(id);
            }, 300);
        }
    }
}

// ===============================================
// GESTIONNAIRE D'APPAREILS AMÉLIORÉ
// ===============================================

class DeviceManagerImproved {
    constructor() {
        this.devices = new Map();
        this.selectedDevice = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.startPolling();
        this.refreshDevices();
    }

    bindEvents() {
        // Scanner les appareils
        document.getElementById('scan-devices')?.addEventListener('click', () => {
            this.scanDevices();
        });

        // Rafraîchir
        document.getElementById('refresh-btn')?.addEventListener('click', () => {
            this.refreshAll();
        });
    }

    async scanDevices() {
        const btn = document.getElementById('scan-devices');
        const spinner = btn.querySelector('.spinner') || document.createElement('span');
        spinner.className = 'spinner';
        btn.prepend(spinner);
        btn.disabled = true;

        try {
            notifications.show('Recherche d'appareils...', 'info');

            if (window.electronAPI?.scanDevices) {
                const devices = await window.electronAPI.scanDevices();
                this.updateDeviceList(devices);
                notifications.show(`${devices.length} appareil(s) trouvé(s)`, 'success');
            } else {
                // Mode démo
                this.updateDeviceList(this.getMockDevices());
            }
        } catch (error) {
            notifications.show('Erreur lors du scan', 'error');
            console.error(error);
        } finally {
            spinner.remove();
            btn.disabled = false;
        }
    }

    updateDeviceList(devices) {
        const list = document.getElementById('device-list');
        if (!list) return;

        list.innerHTML = '';

        // Mettre à jour les stats
        let available = 0, busy = 0, total = devices.length;

        devices.forEach(device => {
            const status = this.getDeviceStatus(device);
            if (status === 'available') available++;
            if (status === 'busy') busy++;

            const deviceEl = this.createDeviceElement(device, status);
            list.appendChild(deviceEl);
            this.devices.set(device.udid, device);
        });

        // Mettre à jour les compteurs
        this.updateStats(total, available, busy);
    }

    createDeviceElement(device, status) {
        const div = document.createElement('div');
        div.className = 'device-item-improved';
        div.dataset.udid = device.udid;

        div.innerHTML = `
            <div class="device-item-content">
                <div class="device-item-header">
                    <span class="device-item-name">${device.name || 'iPhone'}</span>
                    <div class="device-status-indicator ${status}">
                        <span class="status-dot"></span>
                        <span>${this.getStatusText(status)}</span>
                    </div>
                </div>
                <div class="device-item-meta">
                    <span class="device-model">${device.model || 'Unknown'}</span>
                    <span class="device-ios">iOS ${device.osVersion || '-'}</span>
                </div>
            </div>
        `;

        div.addEventListener('click', () => this.selectDevice(device));
        return div;
    }

    getDeviceStatus(device) {
        if (device.busy) return 'busy';
        if (device.error) return 'error';
        if (device.connected) return 'available';
        return 'offline';
    }

    getStatusText(status) {
        const texts = {
            available: 'Disponible',
            busy: 'Occupé',
            error: 'Erreur',
            offline: 'Hors ligne'
        };
        return texts[status] || 'Inconnu';
    }

    selectDevice(device) {
        this.selectedDevice = device;

        // Mettre à jour l'UI
        document.querySelectorAll('.device-item-improved').forEach(el => {
            el.classList.toggle('selected', el.dataset.udid === device.udid);
        });

        // Afficher les détails
        this.showDeviceDetails(device);
    }

    showDeviceDetails(device) {
        document.getElementById('no-device-selected').style.display = 'none';
        document.getElementById('device-detail').style.display = 'block';

        // Mettre à jour les informations
        document.getElementById('device-name').textContent = device.name || 'iPhone';
        document.getElementById('device-udid').textContent = `UDID: ${device.udid}`;

        // Mettre à jour le statut
        const status = this.getDeviceStatus(device);
        const statusEl = document.getElementById('device-status');
        statusEl.className = `device-status-indicator ${status}`;
        statusEl.querySelector('.status-text').textContent = this.getStatusText(status);
    }

    updateStats(total, available, busy) {
        document.getElementById('devices-total').textContent = total;
        document.getElementById('devices-available').textContent = available;
        document.getElementById('devices-busy').textContent = busy;
    }

    getMockDevices() {
        return [
            {
                udid: 'mock-device-1',
                name: 'iPhone 13 Pro',
                model: 'iPhone13,3',
                osVersion: '15.5',
                connected: true,
                busy: false
            }
        ];
    }

    startPolling() {
        // Polling toutes les 5 secondes pour mettre à jour les statuts
        setInterval(() => {
            if (this.selectedDevice) {
                this.updateDeviceStatus(this.selectedDevice);
            }
        }, 5000);
    }

    async updateDeviceStatus(device) {
        // Mettre à jour le statut de l'appareil
        if (window.electronAPI?.getDeviceStatus) {
            try {
                const status = await window.electronAPI.getDeviceStatus(device.udid);
                this.updateDeviceUI(device, status);
            } catch (error) {
                console.error('Error updating device status:', error);
            }
        }
    }

    updateDeviceUI(device, status) {
        // Mettre à jour les badges de statut
        const badges = {
            bot: document.getElementById('bot-status'),
            appium: document.getElementById('appium-status'),
            wda: document.getElementById('wda-status')
        };

        if (badges.bot) {
            badges.bot.textContent = status.bot || 'Inactif';
            badges.bot.className = `badge ${status.bot === 'Running' ? 'badge-success' : ''}`;
        }

        if (badges.appium) {
            badges.appium.textContent = status.appium || 'Arrêté';
            badges.appium.className = `badge ${status.appium === 'Running' ? 'badge-success' : ''}`;
        }

        if (badges.wda) {
            badges.wda.textContent = status.wda || 'Arrêté';
            badges.wda.className = `badge ${status.wda === 'Running' ? 'badge-success' : ''}`;
        }
    }

    async refreshAll() {
        const btn = document.getElementById('refresh-btn');
        const spinner = btn.querySelector('.spinner');
        const text = btn.querySelector('.btn-text');

        spinner.style.display = 'inline-block';
        text.style.display = 'none';

        try {
            await this.refreshDevices();
            notifications.show('Données actualisées', 'success');
        } catch (error) {
            notifications.show('Erreur de rafraîchissement', 'error');
        } finally {
            spinner.style.display = 'none';
            text.style.display = 'inline-block';
        }
    }

    async refreshDevices() {
        // Rafraîchir la liste des appareils
        await this.scanDevices();
    }
}

// ===============================================
// GESTIONNAIRE DE LOGS AMÉLIORÉ
// ===============================================

class LogManagerImproved {
    constructor() {
        this.logs = [];
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupWebSocket();
    }

    bindEvents() {
        // Filtres
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                this.setFilter(e.target.dataset.level);
            });
        });

        // Recherche
        const searchInput = document.getElementById('logs-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.renderLogs();
            });
        }

        // Actions
        document.getElementById('clear-logs')?.addEventListener('click', () => {
            this.clearLogs();
        });

        document.getElementById('export-logs')?.addEventListener('click', () => {
            this.exportLogs();
        });
    }

    setFilter(level) {
        this.currentFilter = level;

        // Mettre à jour l'UI
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.classList.toggle('active', chip.dataset.level === level);
        });

        this.renderLogs();
    }

    addLog(message, level = 'info') {
        const log = {
            timestamp: new Date().toLocaleTimeString(),
            level,
            message
        };

        this.logs.push(log);

        // Limiter à 1000 logs
        if (this.logs.length > 1000) {
            this.logs.shift();
        }

        this.appendLogToUI(log);
    }

    appendLogToUI(log) {
        if (!this.shouldShowLog(log)) return;

        const container = document.getElementById('logs-container');
        if (!container) return;

        const logEl = document.createElement('div');
        logEl.className = 'log-line';
        logEl.innerHTML = `
            <span class="log-timestamp">${log.timestamp}</span>
            <span class="log-level ${log.level}">${log.level.toUpperCase()}</span>
            <span class="log-message">${this.escapeHtml(log.message)}</span>
        `;

        container.appendChild(logEl);

        // Auto-scroll
        container.scrollTop = container.scrollHeight;
    }

    shouldShowLog(log) {
        // Filtre par niveau
        if (this.currentFilter !== 'all' && log.level !== this.currentFilter) {
            return false;
        }

        // Filtre par recherche
        if (this.searchTerm && !log.message.toLowerCase().includes(this.searchTerm)) {
            return false;
        }

        return true;
    }

    renderLogs() {
        const container = document.getElementById('logs-container');
        if (!container) return;

        container.innerHTML = '';
        this.logs.forEach(log => this.appendLogToUI(log));
    }

    clearLogs() {
        this.logs = [];
        this.renderLogs();
        notifications.show('Logs effacés', 'success');
    }

    exportLogs() {
        const data = this.logs.map(log =>
            `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`
        ).join('\n');

        const blob = new Blob([data], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs_${new Date().toISOString()}.txt`;
        a.click();
        URL.revokeObjectURL(url);

        notifications.show('Logs exportés', 'success');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupWebSocket() {
        // Connexion WebSocket pour les logs en temps réel
        if (window.electronAPI?.onLogMessage) {
            window.electronAPI.onLogMessage((message, level) => {
                this.addLog(message, level);
            });
        } else {
            // Mode démo - générer des logs de test
            this.generateTestLogs();
        }
    }

    generateTestLogs() {
        setInterval(() => {
            const levels = ['info', 'warning', 'error', 'success'];
            const messages = [
                'Connexion établie',
                'Traitement en cours',
                'Opération terminée',
                'Avertissement: Ressources limitées',
                'Erreur: Timeout dépassé'
            ];

            const level = levels[Math.floor(Math.random() * levels.length)];
            const message = messages[Math.floor(Math.random() * messages.length)];

            this.addLog(message, level);
        }, 3000);
    }
}

// ===============================================
// INITIALISATION
// ===============================================

let navigation, notifications, deviceManager, logManager;

document.addEventListener('DOMContentLoaded', () => {
    // Initialiser les gestionnaires
    navigation = new NavigationManager();
    notifications = new NotificationManager();
    deviceManager = new DeviceManagerImproved();
    logManager = new LogManagerImproved();

    // Message de bienvenue
    notifications.show('Interface chargée avec succès', 'success');

    // Gérer les erreurs globales
    window.addEventListener('error', (e) => {
        console.error('Global error:', e);
        notifications.show('Une erreur est survenue', 'error');
    });

    // Gérer les promesses rejetées
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled rejection:', e);
        notifications.show('Erreur non gérée détectée', 'error');
    });
});

// Export pour utilisation externe
window.UIManagers = {
    navigation,
    notifications,
    deviceManager,
    logManager
};