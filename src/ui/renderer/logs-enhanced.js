/**
 * Module d'amélioration des logs
 * Ajoute le filtrage par niveau, la recherche et une meilleure coloration syntaxique
 */

class LogsEnhancer {
    constructor() {
        this.currentFilter = 'all';
        this.searchTerm = '';
        this.allLogs = [];
        this.filteredLogs = [];
    }

    /**
     * Initialise le module d'amélioration des logs
     */
    initialize() {
        this.createFilterControls();
        this.attachEventListeners();
        this.enhanceLogColors();
    }

    /**
     * Crée les contrôles de filtrage et de recherche
     */
    createFilterControls() {
        const logsControls = document.querySelector('.logs-controls');
        if (!logsControls) return;

        // Créer le conteneur des nouveaux contrôles
        const enhancedControls = document.createElement('div');
        enhancedControls.className = 'logs-enhanced-controls';
        enhancedControls.innerHTML = `
            <!-- Filtrage par niveau -->
            <div class="log-filter-group">
                <label class="filter-label">Filtrer :</label>
                <div class="filter-buttons">
                    <button class="filter-btn active" data-level="all">
                        <span class="badge-all">Tout</span>
                    </button>
                    <button class="filter-btn" data-level="info">
                        <span class="badge-info">ℹ️ Info</span>
                    </button>
                    <button class="filter-btn" data-level="success">
                        <span class="badge-success">✅ Succès</span>
                    </button>
                    <button class="filter-btn" data-level="warning">
                        <span class="badge-warning">⚠️ Warning</span>
                    </button>
                    <button class="filter-btn" data-level="error">
                        <span class="badge-error">❌ Erreur</span>
                    </button>
                </div>
            </div>

            <!-- Recherche -->
            <div class="log-search-group">
                <input type="text"
                       id="log-search"
                       class="log-search-input"
                       placeholder="🔍 Rechercher dans les logs..."
                       autocomplete="off">
                <button id="clear-search" class="btn-clear-search" title="Effacer la recherche">×</button>
            </div>

            <!-- Compteur de résultats -->
            <div class="log-stats">
                <span id="log-count" class="log-count">0 logs</span>
            </div>
        `;

        // Insérer avant les contrôles existants
        logsControls.insertBefore(enhancedControls, logsControls.firstChild);
    }

    /**
     * Attache les événements aux contrôles
     */
    attachEventListeners() {
        // Filtrage par niveau
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFilter(e.target.closest('.filter-btn').dataset.level);
            });
        });

        // Recherche
        const searchInput = document.getElementById('log-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchTerm = e.target.value.toLowerCase();
                this.applyFilters();
            });

            // Raccourci clavier pour focus sur la recherche
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
                    e.preventDefault();
                    searchInput.focus();
                    searchInput.select();
                }
            });
        }

        // Bouton clear search
        const clearSearchBtn = document.getElementById('clear-search');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                this.searchTerm = '';
                this.applyFilters();
            });
        }
    }

    /**
     * Définit le filtre actif
     */
    setFilter(level) {
        this.currentFilter = level;

        // Mettre à jour l'UI
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.level === level);
        });

        this.applyFilters();
    }

    /**
     * Applique les filtres et la recherche
     */
    applyFilters() {
        const logsContainer = document.getElementById('logs-container');
        if (!logsContainer) return;

        // Récupérer tous les logs actuels
        const logEntries = logsContainer.querySelectorAll('.log-entry');
        let visibleCount = 0;

        logEntries.forEach(entry => {
            let shouldShow = true;

            // Filtre par niveau
            if (this.currentFilter !== 'all') {
                const logLevel = this.getLogLevel(entry);
                shouldShow = logLevel === this.currentFilter;
            }

            // Filtre par recherche
            if (shouldShow && this.searchTerm) {
                const logText = entry.textContent.toLowerCase();
                shouldShow = logText.includes(this.searchTerm);

                // Surligner le terme recherché si visible
                if (shouldShow) {
                    this.highlightSearchTerm(entry);
                } else {
                    this.removeHighlight(entry);
                }
            } else {
                this.removeHighlight(entry);
            }

            // Afficher ou masquer l'entrée
            entry.style.display = shouldShow ? 'block' : 'none';
            if (shouldShow) visibleCount++;
        });

        // Mettre à jour le compteur
        this.updateLogCount(visibleCount, logEntries.length);
    }

    /**
     * Extrait le niveau d'un élément de log
     */
    getLogLevel(logEntry) {
        const classes = logEntry.className.split(' ');
        for (const cls of classes) {
            if (cls.startsWith('log-')) {
                const level = cls.replace('log-', '');
                if (['info', 'success', 'warning', 'error'].includes(level)) {
                    return level;
                }
            }
        }
        return 'info';
    }

    /**
     * Surligne le terme de recherche dans un log
     */
    highlightSearchTerm(logEntry) {
        const messageSpan = logEntry.querySelector('.log-message');
        if (!messageSpan) return;

        const originalText = messageSpan.textContent;
        const regex = new RegExp(`(${this.escapeRegex(this.searchTerm)})`, 'gi');

        messageSpan.innerHTML = originalText.replace(regex, '<mark class="search-highlight">$1</mark>');
    }

    /**
     * Supprime le surlignage
     */
    removeHighlight(logEntry) {
        const messageSpan = logEntry.querySelector('.log-message');
        if (!messageSpan) return;

        const marks = messageSpan.querySelectorAll('mark');
        marks.forEach(mark => {
            mark.replaceWith(mark.textContent);
        });
    }

    /**
     * Échappe les caractères spéciaux pour regex
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Met à jour le compteur de logs
     */
    updateLogCount(visible, total) {
        const countElement = document.getElementById('log-count');
        if (countElement) {
            if (visible === total) {
                countElement.textContent = `${total} logs`;
            } else {
                countElement.textContent = `${visible} / ${total} logs`;
            }
        }
    }

    /**
     * Améliore les couleurs des logs
     */
    enhanceLogColors() {
        // Ajouter des styles CSS améliorés
        const style = document.createElement('style');
        style.textContent = `
            /* Contrôles améliorés */
            .logs-enhanced-controls {
                display: flex;
                align-items: center;
                gap: 20px;
                margin-bottom: 10px;
                padding: 10px;
                background: rgba(0, 0, 0, 0.05);
                border-radius: 8px;
            }

            .log-filter-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .filter-label {
                font-size: 12px;
                font-weight: 600;
                color: #666;
            }

            .filter-buttons {
                display: flex;
                gap: 5px;
            }

            .filter-btn {
                padding: 4px 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                background: white;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s;
            }

            .filter-btn:hover {
                background: #f5f5f5;
                transform: translateY(-1px);
            }

            .filter-btn.active {
                background: #667eea;
                color: white;
                border-color: #667eea;
            }

            .log-search-group {
                flex: 1;
                position: relative;
            }

            .log-search-input {
                width: 100%;
                padding: 6px 30px 6px 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
                transition: border-color 0.2s;
            }

            .log-search-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
            }

            .btn-clear-search {
                position: absolute;
                right: 5px;
                top: 50%;
                transform: translateY(-50%);
                width: 20px;
                height: 20px;
                border: none;
                background: transparent;
                cursor: pointer;
                font-size: 18px;
                color: #999;
                display: none;
            }

            .log-search-input:not(:placeholder-shown) + .btn-clear-search {
                display: block;
            }

            .log-count {
                font-size: 11px;
                color: #666;
                padding: 4px 8px;
                background: rgba(0, 0, 0, 0.05);
                border-radius: 4px;
            }

            /* Amélioration des couleurs de logs */
            .log-entry {
                padding: 8px 12px;
                margin-bottom: 4px;
                border-radius: 4px;
                font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
                font-size: 12px;
                line-height: 1.4;
                transition: all 0.2s;
                border-left: 3px solid transparent;
            }

            .log-entry:hover {
                background: rgba(0, 0, 0, 0.02);
            }

            .log-info {
                background: rgba(59, 130, 246, 0.05);
                border-left-color: #3b82f6;
                color: #1e3a8a;
            }

            .log-success {
                background: rgba(34, 197, 94, 0.05);
                border-left-color: #22c55e;
                color: #14532d;
            }

            .log-warning {
                background: rgba(251, 146, 60, 0.05);
                border-left-color: #fb923c;
                color: #7c2d12;
            }

            .log-error {
                background: rgba(239, 68, 68, 0.05);
                border-left-color: #ef4444;
                color: #7f1d1d;
            }

            .log-time {
                color: #666;
                font-weight: 500;
                margin-right: 10px;
            }

            .log-message {
                color: inherit;
                word-break: break-word;
            }

            /* Syntaxe highlighting pour certains patterns */
            .log-message .keyword {
                color: #7c3aed;
                font-weight: 600;
            }

            .log-message .string {
                color: #059669;
            }

            .log-message .number {
                color: #dc2626;
            }

            .log-message .url {
                color: #2563eb;
                text-decoration: underline;
            }

            /* Highlight de recherche */
            .search-highlight {
                background: #fef08a;
                padding: 1px 2px;
                border-radius: 2px;
                font-weight: 600;
                color: #713f12;
            }

            /* Animation de nouvelle entrée */
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(-10px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .log-entry.new-entry {
                animation: slideIn 0.3s ease-out;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Améliore le formatage d'un message de log
     */
    formatLogMessage(message) {
        // Détecter et colorier les URLs
        message = message.replace(
            /(https?:\/\/[^\s]+)/g,
            '<span class="url">$1</span>'
        );

        // Détecter et colorier les strings entre quotes
        message = message.replace(
            /"([^"]*)"/g,
            '<span class="string">"$1"</span>'
        );

        // Détecter et colorier les nombres
        message = message.replace(
            /\b(\d+)\b/g,
            '<span class="number">$1</span>'
        );

        // Détecter certains mots-clés importants
        const keywords = ['ERROR', 'WARNING', 'SUCCESS', 'FAILED', 'STARTED', 'STOPPED', 'CONNECTING', 'CONNECTED'];
        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
            message = message.replace(regex, '<span class="keyword">$1</span>');
        });

        return message;
    }
}

// Exporter pour utilisation globale
window.LogsEnhancer = LogsEnhancer;