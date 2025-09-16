/**
 * Module pour les actions groupées et le mode batch multi-appareils
 * Permet d'effectuer des actions sur plusieurs appareils simultanément
 */

class MultiActions {
    constructor() {
        this.selectedDevices = new Set();
        this.batchMode = false;
    }

    /**
     * Initialise le module d'actions multiples
     */
    initialize() {
        this.createActionBar();
        this.attachEventListeners();
        this.enhanceDeviceSelection();
    }

    /**
     * Crée la barre d'actions groupées
     */
    createActionBar() {
        // Trouver l'emplacement pour insérer la barre d'actions
        const header = document.querySelector('.header-actions');
        if (!header) return;

        // Créer la barre d'actions groupées
        const actionBar = document.createElement('div');
        actionBar.id = 'multi-actions-bar';
        actionBar.className = 'multi-actions-bar hidden';
        actionBar.innerHTML = `
            <div class="multi-actions-container">
                <div class="selected-count">
                    <span class="icon">✅</span>
                    <span id="selected-devices-count">0</span> appareil(s) sélectionné(s)
                </div>

                <div class="batch-actions">
                    <button id="batch-start-all" class="btn btn-success" title="Démarrer tous les bots sélectionnés">
                        <span class="icon">▶️</span>
                        Tout démarrer
                    </button>

                    <button id="batch-stop-all" class="btn btn-danger" title="Arrêter tous les bots sélectionnés">
                        <span class="icon">⏹️</span>
                        Tout arrêter
                    </button>

                    <button id="batch-restart-all" class="btn btn-warning" title="Redémarrer tous les bots sélectionnés">
                        <span class="icon">🔄</span>
                        Tout redémarrer
                    </button>

                    <button id="batch-clear-selection" class="btn btn-secondary" title="Désélectionner tous">
                        <span class="icon">❌</span>
                        Désélectionner
                    </button>
                </div>

                <div class="batch-mode-toggle">
                    <label class="switch">
                        <input type="checkbox" id="batch-mode-toggle">
                        <span class="slider"></span>
                    </label>
                    <label for="batch-mode-toggle" class="batch-mode-label">Mode Batch</label>
                </div>
            </div>
        `;

        // Insérer après le header
        header.parentNode.insertBefore(actionBar, header.nextSibling);
    }

    /**
     * Attache les événements aux boutons d'actions
     */
    attachEventListeners() {
        // Toggle du mode batch
        const batchToggle = document.getElementById('batch-mode-toggle');
        if (batchToggle) {
            batchToggle.addEventListener('change', (e) => {
                this.toggleBatchMode(e.target.checked);
            });
        }

        // Bouton "Tout démarrer"
        document.getElementById('batch-start-all')?.addEventListener('click', () => {
            this.startAllSelected();
        });

        // Bouton "Tout arrêter"
        document.getElementById('batch-stop-all')?.addEventListener('click', () => {
            this.stopAllSelected();
        });

        // Bouton "Tout redémarrer"
        document.getElementById('batch-restart-all')?.addEventListener('click', () => {
            this.restartAllSelected();
        });

        // Bouton "Désélectionner"
        document.getElementById('batch-clear-selection')?.addEventListener('click', () => {
            this.clearSelection();
        });

        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + A pour sélectionner tous les appareils
            if ((e.ctrlKey || e.metaKey) && e.key === 'a' && this.batchMode) {
                e.preventDefault();
                this.selectAllDevices();
            }

            // Ctrl/Cmd + Shift + S pour démarrer tous
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 's') {
                e.preventDefault();
                this.startAllSelected();
            }

            // Ctrl/Cmd + Shift + X pour arrêter tous
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'x') {
                e.preventDefault();
                this.stopAllSelected();
            }
        });
    }

    /**
     * Améliore la sélection des appareils pour le mode batch
     */
    enhanceDeviceSelection() {
        // Observer les changements dans la liste des appareils
        const deviceList = document.getElementById('device-list');
        if (!deviceList) return;

        // Utiliser MutationObserver pour détecter l'ajout de nouveaux appareils
        const observer = new MutationObserver(() => {
            this.updateDeviceItems();
        });

        observer.observe(deviceList, { childList: true, subtree: true });
    }

    /**
     * Met à jour les éléments d'appareil pour le mode batch
     */
    updateDeviceItems() {
        if (!this.batchMode) return;

        const deviceItems = document.querySelectorAll('.device-item');
        deviceItems.forEach(item => {
            // Ajouter une checkbox si elle n'existe pas déjà
            if (!item.querySelector('.batch-checkbox')) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'batch-checkbox';
                checkbox.addEventListener('change', (e) => {
                    const deviceId = item.dataset.deviceId;
                    if (e.target.checked) {
                        this.selectedDevices.add(deviceId);
                        item.classList.add('batch-selected');
                    } else {
                        this.selectedDevices.delete(deviceId);
                        item.classList.remove('batch-selected');
                    }
                    this.updateSelectedCount();
                });

                item.insertBefore(checkbox, item.firstChild);
            }
        });
    }

    /**
     * Active/désactive le mode batch
     */
    toggleBatchMode(enabled) {
        this.batchMode = enabled;
        const actionBar = document.getElementById('multi-actions-bar');

        if (enabled) {
            actionBar?.classList.remove('hidden');
            document.body.classList.add('batch-mode');
            this.updateDeviceItems();
            this.showNotification('Mode batch activé', 'info');
        } else {
            actionBar?.classList.add('hidden');
            document.body.classList.remove('batch-mode');
            this.clearSelection();
            this.removeCheckboxes();
            this.showNotification('Mode batch désactivé', 'info');
        }
    }

    /**
     * Supprime les checkboxes du mode batch
     */
    removeCheckboxes() {
        document.querySelectorAll('.batch-checkbox').forEach(cb => cb.remove());
        document.querySelectorAll('.batch-selected').forEach(item => {
            item.classList.remove('batch-selected');
        });
    }

    /**
     * Met à jour le compteur d'appareils sélectionnés
     */
    updateSelectedCount() {
        const count = this.selectedDevices.size;
        const countElement = document.getElementById('selected-devices-count');
        if (countElement) {
            countElement.textContent = count;
        }

        // Activer/désactiver les boutons selon la sélection
        const hasSelection = count > 0;
        document.getElementById('batch-start-all')?.classList.toggle('disabled', !hasSelection);
        document.getElementById('batch-stop-all')?.classList.toggle('disabled', !hasSelection);
        document.getElementById('batch-restart-all')?.classList.toggle('disabled', !hasSelection);
    }

    /**
     * Sélectionne tous les appareils
     */
    selectAllDevices() {
        const checkboxes = document.querySelectorAll('.batch-checkbox');
        checkboxes.forEach(cb => {
            if (!cb.checked) {
                cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            }
        });
    }

    /**
     * Désélectionne tous les appareils
     */
    clearSelection() {
        const checkboxes = document.querySelectorAll('.batch-checkbox');
        checkboxes.forEach(cb => {
            if (cb.checked) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            }
        });
        this.selectedDevices.clear();
        this.updateSelectedCount();
    }

    /**
     * Démarre tous les bots sélectionnés
     */
    async startAllSelected() {
        if (this.selectedDevices.size === 0) {
            this.showNotification('Aucun appareil sélectionné', 'warning');
            return;
        }

        const devices = Array.from(this.selectedDevices);
        this.showNotification(`Démarrage de ${devices.length} bot(s)...`, 'info');

        for (const deviceId of devices) {
            try {
                await window.electronAPI.startBot(deviceId);
                this.addLog(`✅ Bot démarré sur ${deviceId}`, 'success');

                // Petit délai entre les lancements pour éviter la surcharge
                await this.delay(500);
            } catch (error) {
                this.addLog(`❌ Erreur démarrage ${deviceId}: ${error.message}`, 'error');
            }
        }

        this.showNotification('Démarrage terminé', 'success');
    }

    /**
     * Arrête tous les bots sélectionnés
     */
    async stopAllSelected() {
        if (this.selectedDevices.size === 0) {
            this.showNotification('Aucun appareil sélectionné', 'warning');
            return;
        }

        const devices = Array.from(this.selectedDevices);
        this.showNotification(`Arrêt de ${devices.length} bot(s)...`, 'info');

        // Arrêt en parallèle pour plus de rapidité
        const stopPromises = devices.map(async (deviceId) => {
            try {
                await window.electronAPI.stopBot(deviceId);
                this.addLog(`⏹️ Bot arrêté sur ${deviceId}`, 'info');
            } catch (error) {
                this.addLog(`❌ Erreur arrêt ${deviceId}: ${error.message}`, 'error');
            }
        });

        await Promise.all(stopPromises);
        this.showNotification('Arrêt terminé', 'success');
    }

    /**
     * Redémarre tous les bots sélectionnés
     */
    async restartAllSelected() {
        if (this.selectedDevices.size === 0) {
            this.showNotification('Aucun appareil sélectionné', 'warning');
            return;
        }

        this.showNotification('Redémarrage en cours...', 'info');

        // Arrêter tous d'abord
        await this.stopAllSelected();

        // Attendre un peu
        await this.delay(1000);

        // Redémarrer tous
        await this.startAllSelected();
    }

    /**
     * Utilitaire de délai
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Affiche une notification
     */
    showNotification(message, type = 'info') {
        if (window.UIEnhancements) {
            window.UIEnhancements.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Ajoute un log
     */
    addLog(message, level = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = { timestamp, message, level };

        // Ajouter au système de logs existant
        if (window.addLog) {
            window.addLog('system', logEntry);
        }
    }
}

// Ajouter les styles CSS nécessaires
const style = document.createElement('style');
style.textContent = `
    /* Barre d'actions multiples */
    .multi-actions-bar {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        margin: 10px 0;
        transition: all 0.3s ease;
    }

    .multi-actions-bar.hidden {
        display: none;
    }

    .multi-actions-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
    }

    .selected-count {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
    }

    .batch-actions {
        display: flex;
        gap: 10px;
    }

    .batch-actions .btn {
        padding: 8px 16px;
        font-size: 13px;
    }

    .batch-actions .btn.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Toggle switch pour le mode batch */
    .batch-mode-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .batch-mode-label {
        font-weight: 500;
        cursor: pointer;
    }

    .switch {
        position: relative;
        display: inline-block;
        width: 50px;
        height: 24px;
    }

    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.3);
        transition: .4s;
        border-radius: 24px;
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }

    input:checked + .slider {
        background-color: #22c55e;
    }

    input:checked + .slider:before {
        transform: translateX(26px);
    }

    /* Mode batch actif */
    body.batch-mode .device-item {
        position: relative;
        padding-left: 40px;
    }

    .batch-checkbox {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .device-item.batch-selected {
        background: rgba(102, 126, 234, 0.1);
        border: 2px solid #667eea;
    }

    /* Animations */
    @keyframes pulse {
        0% {
            box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7);
        }
        70% {
            box-shadow: 0 0 0 10px rgba(102, 126, 234, 0);
        }
        100% {
            box-shadow: 0 0 0 0 rgba(102, 126, 234, 0);
        }
    }

    .batch-actions .btn:active {
        animation: pulse 0.5s;
    }
`;
document.head.appendChild(style);

// Exporter pour utilisation globale
window.MultiActions = MultiActions;