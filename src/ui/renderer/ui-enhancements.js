// Améliorations de l'interface utilisateur
// Gestion des erreurs, notifications, et connexion WebSocket

// Gestion des erreurs globales
function initializeErrorHandling() {
    window.addEventListener('error', (event) => {
        console.error('Erreur globale:', event.error);
        showNotification('Une erreur inattendue s\'est produite', 'error');
        logError(event.error);
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('Promise rejetée:', event.reason);
        showNotification('Erreur de traitement asynchrone', 'error');
        logError(event.reason);
    });
}

// Système de notifications
function initializeNotifications() {
    // Créer le conteneur de notifications s'il n'existe pas
    if (!document.getElementById('notification-container')) {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
}

function showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification notification-${type} notification-enter`;

    const icon = {
        'success': '✓',
        'error': '✕',
        'warning': '⚠',
        'info': 'ℹ'
    }[type] || 'ℹ';

    notification.innerHTML = `
        <span class="notification-icon">${icon}</span>
        <span class="notification-message">${message}</span>
        <button class="notification-close">×</button>
    `;

    container.appendChild(notification);

    // Animation d'entrée
    setTimeout(() => {
        notification.classList.remove('notification-enter');
    }, 10);

    // Fermeture au clic
    notification.querySelector('.notification-close').addEventListener('click', () => {
        removeNotification(notification);
    });

    // Fermeture automatique
    if (duration > 0) {
        setTimeout(() => {
            removeNotification(notification);
        }, duration);
    }

    return notification;
}

function removeNotification(notification) {
    notification.classList.add('notification-exit');
    setTimeout(() => {
        notification.remove();
    }, 300);
}

// Gestion de la connexion WebSocket avec reconnexion automatique
class WebSocketManager {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = new Map();
        this.isConnecting = false;
        this.isConnected = false;
    }

    connect() {
        if (this.isConnecting || this.isConnected) return;

        this.isConnecting = true;
        showNotification('Connexion au serveur WebSocket...', 'info');

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                this.isConnecting = false;
                this.isConnected = true;
                this.reconnectAttempts = 0;
                showNotification('Connecté au serveur', 'success');
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.emit('message', data);
                } catch (error) {
                    console.error('Erreur lors du parsing du message WebSocket:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('Erreur WebSocket:', error);
                showNotification('Erreur de connexion WebSocket', 'error');
                this.emit('error', error);
            };

            this.ws.onclose = () => {
                this.isConnecting = false;
                this.isConnected = false;
                this.emit('disconnected');
                this.handleReconnect();
            };

        } catch (error) {
            this.isConnecting = false;
            console.error('Erreur lors de la création du WebSocket:', error);
            this.handleReconnect();
        }
    }

    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            showNotification('Impossible de se reconnecter au serveur', 'error');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        showNotification(`Reconnexion dans ${delay / 1000}s... (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'warning');

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    send(data) {
        if (!this.isConnected) {
            console.error('WebSocket non connecté');
            showNotification('Connexion au serveur perdue', 'error');
            return false;
        }

        try {
            this.ws.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message:', error);
            showNotification('Erreur lors de l\'envoi des données', 'error');
            return false;
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => callback(data));
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}

// Logging des erreurs dans un fichier local
function logError(error) {
    const errorLog = {
        timestamp: new Date().toISOString(),
        message: error.message || error.toString(),
        stack: error.stack,
        userAgent: navigator.userAgent,
        url: window.location.href
    };

    // Envoyer l'erreur au processus principal pour l'écrire dans un fichier
    if (window.electronAPI && window.electronAPI.logError) {
        window.electronAPI.logError(errorLog);
    }
}

// Fonction pour vérifier la connexion réseau
function checkNetworkConnection() {
    if (!navigator.onLine) {
        showNotification('Connexion Internet perdue', 'warning');
        return false;
    }
    return true;
}

// Gestion des timeouts pour les opérations asynchrones
function withTimeout(promise, timeoutMs = 30000, errorMessage = 'Opération timeout') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        })
    ]);
}

// Retry logic pour les opérations qui peuvent échouer
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;

            console.warn(`Tentative ${i + 1} échouée, nouvelle tentative dans ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
}

// Export des fonctions pour utilisation dans renderer.js
window.UIEnhancements = {
    initializeErrorHandling,
    initializeNotifications,
    showNotification,
    removeNotification,
    WebSocketManager,
    logError,
    checkNetworkConnection,
    withTimeout,
    retryOperation
};