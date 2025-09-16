// Queue Manager UI Controller

let selectedPriority = 2; // Normal by default
let selectedDevices = new Set();
let refreshInterval = null;
let queueData = {
    tasks: [],
    stats: {},
    devices: []
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Queue Manager UI initialized');

    setupEventListeners();
    await loadDevices();
    await refreshQueue();
    startAutoRefresh();
    subscribeToQueueUpdates();
});

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Queue controls
    document.getElementById('refresh-queue').addEventListener('click', refreshQueue);
    document.getElementById('clear-completed').addEventListener('click', clearCompletedTasks);

    // Task creation
    document.getElementById('create-task').addEventListener('click', createSingleTask);
    document.getElementById('create-batch').addEventListener('click', createBatchTasks);

    // Priority selection
    document.querySelectorAll('.priority-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            selectedPriority = parseInt(e.target.dataset.priority);
        });
    });

    // Batch count input
    document.getElementById('batch-count').addEventListener('input', (e) => {
        const count = e.target.value;
        document.getElementById('create-batch').textContent = `Créer ${count || 0} tâches`;
    });
}

// Load available devices
async function loadDevices() {
    try {
        // Check if electronAPI is available
        if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
            console.warn('electronAPI not available, using mock devices');
            const mockDevices = [
                { udid: 'mock-device-1', name: 'iPhone 12', status: 'available' },
                { udid: 'mock-device-2', name: 'iPhone 13', status: 'available' }
            ];
            displayDeviceSelector(mockDevices);
            return;
        }

        const devices = await window.electronAPI.invoke('orchestrator:scanDevices');
        queueData.devices = devices;
        displayDeviceSelector(devices);

    } catch (error) {
        console.error('Error loading devices:', error);
        showNotification('Erreur lors du chargement des appareils', 'error');
    }
}

// Display device selector
function displayDeviceSelector(devices) {
    const container = document.getElementById('device-selector');

    if (!devices || devices.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999;">Aucun appareil disponible</div>';
        return;
    }

    container.innerHTML = devices.map(device => `
        <div class="device-checkbox ${selectedDevices.has(device.udid) ? 'selected' : ''}"
             data-device-id="${device.udid}">
            <input type="checkbox"
                   id="device-${device.udid}"
                   ${selectedDevices.has(device.udid) ? 'checked' : ''}>
            <label for="device-${device.udid}">
                📱 ${device.name || device.udid}
                <span style="font-size: 0.85rem; color: #999; margin-left: 10px;">
                    ${device.status === 'busy' ? '🔴 Occupé' : '🟢 Disponible'}
                </span>
            </label>
        </div>
    `).join('');

    // Add event listeners
    container.querySelectorAll('.device-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            const deviceId = checkbox.dataset.deviceId;
            const input = checkbox.querySelector('input');

            if (selectedDevices.has(deviceId)) {
                selectedDevices.delete(deviceId);
                checkbox.classList.remove('selected');
                input.checked = false;
            } else {
                selectedDevices.add(deviceId);
                checkbox.classList.add('selected');
                input.checked = true;
            }
        });
    });
}

// Create single task
async function createSingleTask() {
    const taskData = {
        type: document.getElementById('task-type').value,
        app: document.getElementById('task-app').value,
        accountsNumber: 1,
        proxyProvider: 'marsproxies',
        config: {
            timeout: 300000
        }
    };

    const options = {
        priority: selectedPriority,
        metadata: {
            createdAt: new Date().toISOString(),
            source: 'UI'
        }
    };

    if (selectedDevices.size === 0) {
        showNotification('Veuillez sélectionner au moins un appareil', 'warning');
        return;
    }

    try {
        // Create one task per selected device
        for (const deviceId of selectedDevices) {
            const result = await window.electronAPI.invoke('orchestrator:enqueueTask', {
                taskData: { ...taskData, targetDevice: deviceId },
                options
            });

            if (result.success) {
                showNotification(`Tâche créée pour ${deviceId}`, 'success');
            }
        }

        await refreshQueue();

    } catch (error) {
        console.error('Error creating task:', error);
        showNotification('Erreur lors de la création de la tâche', 'error');
    }
}

// Create batch tasks
async function createBatchTasks() {
    const count = parseInt(document.getElementById('batch-count').value) || 10;
    const taskType = document.getElementById('task-type').value;
    const app = document.getElementById('task-app').value;

    if (selectedDevices.size === 0) {
        showNotification('Veuillez sélectionner au moins un appareil', 'warning');
        return;
    }

    try {
        showNotification(`Création de ${count} tâches...`, 'info');

        for (let i = 0; i < count; i++) {
            const taskData = {
                type: taskType,
                app: app,
                accountsNumber: 1,
                proxyProvider: 'marsproxies',
                config: {
                    timeout: 300000,
                    accountIndex: i + 1
                }
            };

            const options = {
                priority: selectedPriority,
                metadata: {
                    batchId: `batch-${Date.now()}`,
                    batchIndex: i + 1,
                    batchTotal: count,
                    createdAt: new Date().toISOString(),
                    source: 'UI-Batch'
                }
            };

            const result = await window.electronAPI.invoke('orchestrator:enqueueTask', {
                taskData,
                options
            });
        }

        showNotification(`✅ ${count} tâches créées avec succès`, 'success');
        await refreshQueue();

    } catch (error) {
        console.error('Error creating batch tasks:', error);
        showNotification('Erreur lors de la création des tâches', 'error');
    }
}

// Refresh queue display
async function refreshQueue() {
    try {
        // Add spinning animation
        document.getElementById('refresh-queue').classList.add('spinning');

        if (!window.electronAPI || typeof window.electronAPI.invoke !== 'function') {
            // Mock data for demo
            displayMockQueue();
            return;
        }

        const queueStats = await window.electronAPI.invoke('orchestrator:getQueueStats');

        if (queueStats) {
            updateQueueDisplay(queueStats);
            updateStatistics(queueStats);
            updateDeviceUsage(queueStats);
        }

    } catch (error) {
        console.error('Error refreshing queue:', error);
        showNotification('Erreur lors du rafraîchissement', 'error');
    } finally {
        setTimeout(() => {
            document.getElementById('refresh-queue').classList.remove('spinning');
        }, 500);
    }
}

// Update queue display
function updateQueueDisplay(stats) {
    const container = document.getElementById('queue-list');

    // Get all tasks from queue
    const tasks = stats.tasks || [];

    document.getElementById('queue-count').textContent = `${tasks.length} tâches`;

    if (tasks.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999; padding: 40px;">File d\'attente vide</div>';
        return;
    }

    container.innerHTML = tasks.map(task => {
        const priorityClass = getPriorityClass(task.priority);
        const stateClass = task.state === 'running' ? 'running' : '';

        return `
            <div class="task-item ${priorityClass} ${stateClass}" data-task-id="${task.id}">
                <div class="task-info">
                    <div class="task-id">${task.id.substring(0, 8)}...</div>
                    <div class="task-type">${task.type} - ${task.data?.app || 'N/A'}</div>
                    <div class="task-meta">
                        <span>📊 ${task.state}</span>
                        <span>⏱️ ${formatDuration(task.createdAt)}</span>
                        ${task.deviceId ? `<span>📱 ${task.deviceId.substring(0, 8)}...</span>` : ''}
                        ${task.retries > 0 ? `<span>🔄 ${task.retries} tentatives</span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    ${task.state === 'pending' || task.state === 'retrying' ?
                        `<button class="task-btn cancel" onclick="cancelTask('${task.id}')">❌ Annuler</button>` : ''}
                    ${task.state === 'failed' ?
                        `<button class="task-btn retry" onclick="retryTask('${task.id}')">🔄 Réessayer</button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Update statistics
function updateStatistics(stats) {
    const queueStats = stats.queue || {};
    const taskStates = queueStats.taskStates || {};

    document.getElementById('stat-pending').textContent = taskStates.pending || 0;
    document.getElementById('stat-running').textContent = taskStates.running || 0;
    document.getElementById('stat-completed').textContent = taskStates.completed || 0;
    document.getElementById('stat-failed').textContent = taskStates.failed || 0;

    // Update performance metrics
    const avgWaitTime = queueStats.averageWaitTime || 0;
    const avgExecTime = queueStats.averageProcessingTime || 0;

    document.getElementById('avg-wait-time').textContent = formatTime(avgWaitTime);
    document.getElementById('avg-exec-time').textContent = formatTime(avgExecTime);
}

// Update device usage
function updateDeviceUsage(stats) {
    const container = document.getElementById('device-usage');
    const devices = stats.devices || {};

    if (Object.keys(devices).length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #999;">Aucun appareil actif</div>';
        return;
    }

    container.innerHTML = Object.entries(devices).map(([deviceId, info]) => {
        const utilizationBar = `
            <div style="background: var(--bg-secondary); border-radius: 4px; height: 8px; margin-top: 5px;">
                <div style="background: ${info.utilization > 80 ? '#ef4444' : info.utilization > 50 ? '#f97316' : '#10b981'};
                           width: ${info.utilization}%; height: 100%; border-radius: 4px; transition: width 0.3s;"></div>
            </div>
        `;

        return `
            <div style="margin-bottom: 15px; padding: 10px; background: var(--bg-secondary); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 500;">📱 ${info.name || deviceId.substring(0, 8)}</span>
                    <span style="font-size: 0.85rem; color: ${info.status === 'busy' ? '#f97316' : '#10b981'};">
                        ${info.currentLoad}/${info.maxCapacity} tâches
                    </span>
                </div>
                ${utilizationBar}
                <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 5px;">
                    ${info.utilization.toFixed(0)}% utilisé |
                    ${info.stats?.completedTasks || 0} terminées |
                    ${info.stats?.failedTasks || 0} échouées
                </div>
            </div>
        `;
    }).join('');
}

// Helper functions
function getPriorityClass(priority) {
    switch (priority) {
        case 4: return 'critical';
        case 3: return 'high';
        case 2: return 'normal';
        case 1: return 'low';
        default: return 'normal';
    }
}

function formatDuration(startTime) {
    if (!startTime) return '--';
    const ms = Date.now() - new Date(startTime).getTime();
    return formatTime(ms);
}

function formatTime(ms) {
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

// Task actions
async function cancelTask(taskId) {
    try {
        await window.electronAPI.invoke('orchestrator:cancelTask', taskId);
        showNotification('Tâche annulée', 'success');
        await refreshQueue();
    } catch (error) {
        console.error('Error cancelling task:', error);
        showNotification('Erreur lors de l\'annulation', 'error');
    }
}

async function retryTask(taskId) {
    try {
        await window.electronAPI.invoke('orchestrator:retryTask', taskId);
        showNotification('Tâche relancée', 'success');
        await refreshQueue();
    } catch (error) {
        console.error('Error retrying task:', error);
        showNotification('Erreur lors de la relance', 'error');
    }
}

async function clearCompletedTasks() {
    try {
        const confirmed = confirm('Voulez-vous supprimer toutes les tâches terminées ?');
        if (!confirmed) return;

        await window.electronAPI.invoke('orchestrator:clearCompleted');
        showNotification('Tâches terminées supprimées', 'success');
        await refreshQueue();
    } catch (error) {
        console.error('Error clearing completed tasks:', error);
        showNotification('Erreur lors du nettoyage', 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        min-width: 250px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;

    // Set background based on type
    const backgrounds = {
        success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        error: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        info: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
    };

    notification.style.background = backgrounds[type] || backgrounds.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Auto refresh
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        refreshQueue();
    }, 5000); // Refresh every 5 seconds
}

// Subscribe to real-time updates
function subscribeToQueueUpdates() {
    if (!window.electronAPI || typeof window.electronAPI.on !== 'function') {
        console.warn('Cannot subscribe to queue updates - electronAPI not available');
        return;
    }

    // Subscribe to task events
    window.electronAPI.on('queue:task-enqueued', (task) => {
        console.log('Task enqueued:', task);
        refreshQueue();
    });

    window.electronAPI.on('queue:task-completed', ({ task, result }) => {
        showNotification(`✅ Tâche ${task.id.substring(0, 8)} terminée`, 'success');
        refreshQueue();
    });

    window.electronAPI.on('queue:task-failed', ({ task, error }) => {
        showNotification(`❌ Tâche ${task.id.substring(0, 8)} échouée: ${error}`, 'error');
        refreshQueue();
    });
}

// Display mock queue for demo
function displayMockQueue() {
    const mockTasks = [
        {
            id: 'abc12345-def6-7890-ghij-klmnopqrstuv',
            type: 'bot',
            data: { app: 'hinge' },
            priority: 4,
            state: 'running',
            createdAt: new Date(Date.now() - 60000),
            deviceId: 'mock-device-1',
            retries: 0
        },
        {
            id: 'xyz98765-4321-abcd-efgh-ijklmnopqrst',
            type: 'bot',
            data: { app: 'tinder' },
            priority: 2,
            state: 'pending',
            createdAt: new Date(Date.now() - 30000),
            retries: 0
        }
    ];

    updateQueueDisplay({ tasks: mockTasks });
    updateStatistics({
        queue: {
            taskStates: {
                pending: 1,
                running: 1,
                completed: 5,
                failed: 1
            },
            averageWaitTime: 15000,
            averageProcessingTime: 120000
        }
    });

    document.getElementById('queue-count').textContent = '2 tâches';
    document.getElementById('refresh-queue').classList.remove('spinning');
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }

    .spinning {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);