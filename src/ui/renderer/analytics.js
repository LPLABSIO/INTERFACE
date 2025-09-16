/**
 * Analytics Dashboard - Visualisation des données et métriques
 */

class AnalyticsDashboard {
    constructor() {
        this.charts = {};
        this.currentPeriod = 'today';
        this.sessionsData = [];
        this.mockData = this.generateMockData(); // Pour demo
    }

    /**
     * Initialise le dashboard
     */
    async initialize() {
        console.log('Initializing Analytics Dashboard...');

        // Setup event listeners
        this.setupEventListeners();

        // Load initial data
        await this.loadData();

        // Initialize charts
        this.initializeCharts();

        // Update KPIs
        this.updateKPIs();

        // Load sessions table
        this.loadSessionsTable();

        // Start live activity feed
        this.startActivityFeed();

        // Auto-refresh every 30 seconds
        setInterval(() => this.refreshData(), 30000);
    }

    /**
     * Configure les event listeners
     */
    setupEventListeners() {
        // Time filter buttons
        document.querySelectorAll('.time-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentPeriod = e.target.dataset.period;
                this.refreshData();
            });
        });

        // Export button
        document.getElementById('export-data')?.addEventListener('click', () => {
            this.exportData();
        });

        // Search sessions
        document.getElementById('search-sessions')?.addEventListener('input', (e) => {
            this.filterSessions(e.target.value);
        });

        // Timeline type selector
        document.getElementById('timeline-type')?.addEventListener('change', (e) => {
            this.updateTimelineChart(e.target.value);
        });
    }

    /**
     * Charge les données (utilise mock data pour l'instant)
     */
    async loadData() {
        try {
            // En production, on chargerait depuis SessionManager
            // Pour l'instant, on utilise des données mock
            this.sessionsData = this.mockData.sessions;
            console.log('Data loaded successfully');
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }

    /**
     * Génère des données mock pour la démo
     */
    generateMockData() {
        const now = new Date();
        const sessions = [];

        // Générer 50 sessions sur les 7 derniers jours
        for (let i = 0; i < 50; i++) {
            const startTime = new Date(now - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const duration = Math.floor(Math.random() * 120 + 30); // 30-150 minutes
            const status = Math.random() > 0.2 ? 'completed' : Math.random() > 0.5 ? 'failed' : 'running';

            sessions.push({
                id: `session-${i}`,
                deviceId: `iPhone-${Math.floor(Math.random() * 5 + 1)}`,
                startTime: startTime,
                endTime: status === 'running' ? null : new Date(startTime.getTime() + duration * 60 * 1000),
                duration: duration,
                status: status,
                accountsCreated: status === 'completed' ? Math.floor(Math.random() * 5 + 1) : 0,
                cpu: Math.random() * 100,
                memory: Math.random() * 500
            });
        }

        return {
            sessions: sessions.sort((a, b) => b.startTime - a.startTime),
            devices: [
                { id: 'iPhone-1', name: 'iPhone 12 Pro', status: 'active', sessions: 12 },
                { id: 'iPhone-2', name: 'iPhone 13', status: 'active', sessions: 8 },
                { id: 'iPhone-3', name: 'iPhone 14', status: 'inactive', sessions: 15 },
                { id: 'iPhone-4', name: 'iPhone 14 Pro', status: 'active', sessions: 10 },
                { id: 'iPhone-5', name: 'iPhone 15', status: 'active', sessions: 5 }
            ]
        };
    }

    /**
     * Met à jour les KPIs
     */
    updateKPIs() {
        const filtered = this.filterByPeriod(this.sessionsData);

        // Total sessions
        document.getElementById('total-sessions').textContent = filtered.length;

        // Success rate
        const completed = filtered.filter(s => s.status === 'completed').length;
        const successRate = filtered.length > 0 ? Math.round((completed / filtered.length) * 100) : 0;
        document.getElementById('success-rate').textContent = `${successRate}%`;

        // Average duration
        const avgDuration = filtered.reduce((acc, s) => acc + s.duration, 0) / (filtered.length || 1);
        document.getElementById('avg-duration').textContent = `${Math.round(avgDuration)}m`;

        // Active devices
        const activeDevices = new Set(filtered.filter(s => s.status === 'running').map(s => s.deviceId)).size;
        document.getElementById('active-devices').textContent = activeDevices;

        // Accounts created
        const accountsCreated = filtered.reduce((acc, s) => acc + s.accountsCreated, 0);
        document.getElementById('accounts-created').textContent = accountsCreated;

        // CPU usage (average of running sessions)
        const runningSessions = filtered.filter(s => s.status === 'running');
        const avgCpu = runningSessions.reduce((acc, s) => acc + s.cpu, 0) / (runningSessions.length || 1);
        document.getElementById('cpu-usage').textContent = `${Math.round(avgCpu)}%`;

        // Update change indicators
        this.updateChangeIndicators(filtered);
    }

    /**
     * Met à jour les indicateurs de changement
     */
    updateChangeIndicators(data) {
        // Simuler des changements pour la démo
        document.getElementById('sessions-change').textContent = '+12% aujourd\'hui';
        document.getElementById('success-change').textContent = '+5% vs hier';
        document.getElementById('duration-change').textContent = '-10% vs moyenne';
        document.getElementById('devices-status').textContent = '3 disponibles';
        document.getElementById('accounts-change').textContent = '+25% cette semaine';
        document.getElementById('cpu-status').textContent = avgCpu < 50 ? 'Normal' : avgCpu < 80 ? 'Élevé' : 'Critique';
    }

    /**
     * Initialise les graphiques
     */
    initializeCharts() {
        // Timeline Chart
        this.charts.timeline = new Chart(document.getElementById('timeline-chart'), {
            type: 'line',
            data: this.getTimelineData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Success Rate Chart (Doughnut)
        this.charts.success = new Chart(document.getElementById('success-chart'), {
            type: 'doughnut',
            data: this.getSuccessData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });

        // Device Usage Chart (Bar)
        this.charts.device = new Chart(document.getElementById('device-chart'), {
            type: 'bar',
            data: this.getDeviceData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

        // Performance Chart (Line)
        this.charts.performance = new Chart(document.getElementById('performance-chart'), {
            type: 'line',
            data: this.getPerformanceData(),
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    /**
     * Obtient les données pour le graphique timeline
     */
    getTimelineData() {
        const filtered = this.filterByPeriod(this.sessionsData);
        const hourly = {};

        filtered.forEach(session => {
            const hour = new Date(session.startTime).getHours();
            hourly[hour] = (hourly[hour] || 0) + 1;
        });

        return {
            labels: Array.from({length: 24}, (_, i) => `${i}h`),
            datasets: [{
                label: 'Sessions',
                data: Array.from({length: 24}, (_, i) => hourly[i] || 0),
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4
            }]
        };
    }

    /**
     * Obtient les données de taux de succès
     */
    getSuccessData() {
        const filtered = this.filterByPeriod(this.sessionsData);
        const completed = filtered.filter(s => s.status === 'completed').length;
        const failed = filtered.filter(s => s.status === 'failed').length;
        const running = filtered.filter(s => s.status === 'running').length;

        return {
            labels: ['Complétées', 'Échouées', 'En cours'],
            datasets: [{
                data: [completed, failed, running],
                backgroundColor: ['#10b981', '#ef4444', '#3b82f6']
            }]
        };
    }

    /**
     * Obtient les données d'utilisation par appareil
     */
    getDeviceData() {
        const deviceUsage = {};

        this.filterByPeriod(this.sessionsData).forEach(session => {
            deviceUsage[session.deviceId] = (deviceUsage[session.deviceId] || 0) + 1;
        });

        return {
            labels: Object.keys(deviceUsage),
            datasets: [{
                label: 'Sessions',
                data: Object.values(deviceUsage),
                backgroundColor: '#667eea'
            }]
        };
    }

    /**
     * Obtient les données de performance
     */
    getPerformanceData() {
        const filtered = this.filterByPeriod(this.sessionsData).slice(0, 20);

        return {
            labels: filtered.map((_, i) => `T-${i}`),
            datasets: [
                {
                    label: 'CPU %',
                    data: filtered.map(s => s.cpu),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                },
                {
                    label: 'RAM MB',
                    data: filtered.map(s => s.memory / 10), // Scale down for display
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }
            ]
        };
    }

    /**
     * Charge le tableau des sessions
     */
    loadSessionsTable() {
        const tbody = document.getElementById('sessions-tbody');
        const filtered = this.filterByPeriod(this.sessionsData).slice(0, 20);

        tbody.innerHTML = filtered.map(session => `
            <tr>
                <td>${session.id.substring(8)}</td>
                <td>${session.deviceId}</td>
                <td>${new Date(session.startTime).toLocaleString()}</td>
                <td>${session.duration}m</td>
                <td>
                    <span class="status-badge ${session.status}">
                        ${session.status}
                    </span>
                </td>
                <td>${session.accountsCreated}</td>
                <td>
                    <button class="btn btn-small" onclick="viewSessionDetails('${session.id}')">
                        👁️
                    </button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Démarre le feed d'activité
     */
    startActivityFeed() {
        const feedContainer = document.getElementById('activity-feed-items');

        // Ajouter des activités initiales
        const activities = [
            { icon: '✅', type: 'success', title: 'Session complétée', time: 'Il y a 2 min', device: 'iPhone-1' },
            { icon: '🚀', type: 'info', title: 'Nouvelle session démarrée', time: 'Il y a 5 min', device: 'iPhone-3' },
            { icon: '❌', type: 'error', title: 'Session échouée', time: 'Il y a 10 min', device: 'iPhone-2' },
            { icon: '📱', type: 'info', title: 'Appareil connecté', time: 'Il y a 15 min', device: 'iPhone-4' }
        ];

        feedContainer.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="activity-icon ${activity.type}">${activity.icon}</div>
                <div class="activity-content">
                    <div class="activity-title">${activity.title} - ${activity.device}</div>
                    <div class="activity-time">${activity.time}</div>
                </div>
            </div>
        `).join('');

        // Simuler des mises à jour en temps réel
        setInterval(() => {
            this.addActivityItem();
        }, 10000);
    }

    /**
     * Ajoute un élément d'activité
     */
    addActivityItem() {
        const feedContainer = document.getElementById('activity-feed-items');
        const activities = [
            { icon: '✅', type: 'success', title: 'Session complétée' },
            { icon: '🚀', type: 'info', title: 'Nouvelle session' },
            { icon: '⚠️', type: 'warning', title: 'CPU élevé détecté' }
        ];

        const activity = activities[Math.floor(Math.random() * activities.length)];
        const newItem = document.createElement('div');
        newItem.className = 'activity-item';
        newItem.innerHTML = `
            <div class="activity-icon ${activity.type}">${activity.icon}</div>
            <div class="activity-content">
                <div class="activity-title">${activity.title} - iPhone-${Math.floor(Math.random() * 5 + 1)}</div>
                <div class="activity-time">À l'instant</div>
            </div>
        `;

        feedContainer.insertBefore(newItem, feedContainer.firstChild);

        // Limiter à 10 éléments
        while (feedContainer.children.length > 10) {
            feedContainer.removeChild(feedContainer.lastChild);
        }
    }

    /**
     * Filtre les données par période
     */
    filterByPeriod(data) {
        const now = new Date();

        switch(this.currentPeriod) {
            case 'today':
                return data.filter(s => {
                    const diff = now - new Date(s.startTime);
                    return diff < 24 * 60 * 60 * 1000;
                });
            case 'week':
                return data.filter(s => {
                    const diff = now - new Date(s.startTime);
                    return diff < 7 * 24 * 60 * 60 * 1000;
                });
            case 'month':
                return data.filter(s => {
                    const diff = now - new Date(s.startTime);
                    return diff < 30 * 24 * 60 * 60 * 1000;
                });
            default:
                return data;
        }
    }

    /**
     * Filtre les sessions dans le tableau
     */
    filterSessions(searchTerm) {
        const rows = document.querySelectorAll('#sessions-tbody tr');
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(term) ? '' : 'none';
        });
    }

    /**
     * Rafraîchit les données
     */
    async refreshData() {
        await this.loadData();
        this.updateKPIs();
        this.updateCharts();
        this.loadSessionsTable();
    }

    /**
     * Met à jour tous les graphiques
     */
    updateCharts() {
        // Update timeline
        this.charts.timeline.data = this.getTimelineData();
        this.charts.timeline.update();

        // Update success
        this.charts.success.data = this.getSuccessData();
        this.charts.success.update();

        // Update device
        this.charts.device.data = this.getDeviceData();
        this.charts.device.update();

        // Update performance
        this.charts.performance.data = this.getPerformanceData();
        this.charts.performance.update();
    }

    /**
     * Exporte les données
     */
    exportData() {
        const data = {
            period: this.currentPeriod,
            exportDate: new Date().toISOString(),
            sessions: this.filterByPeriod(this.sessionsData),
            kpis: {
                totalSessions: document.getElementById('total-sessions').textContent,
                successRate: document.getElementById('success-rate').textContent,
                avgDuration: document.getElementById('avg-duration').textContent,
                activeDevices: document.getElementById('active-devices').textContent,
                accountsCreated: document.getElementById('accounts-created').textContent,
                cpuUsage: document.getElementById('cpu-usage').textContent
            }
        };

        // Créer et télécharger le fichier JSON
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Data exported successfully');
    }
}

// Fonction globale pour voir les détails d'une session
window.viewSessionDetails = function(sessionId) {
    console.log('View session details:', sessionId);
    alert(`Détails de la session ${sessionId}\n\nCette fonctionnalité sera implémentée prochainement.`);
};

// Initialiser le dashboard au chargement
document.addEventListener('DOMContentLoaded', () => {
    const dashboard = new AnalyticsDashboard();
    dashboard.initialize();
    window.analyticsDashboard = dashboard; // Pour debug
});