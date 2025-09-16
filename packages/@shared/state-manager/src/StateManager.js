const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Gestionnaire d'état centralisé avec persistance et synchronisation
 */
class StateManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.state = {
      devices: new Map(),
      sessions: new Map(),
      processes: new Map(),
      config: {},
      metrics: {},
      ui: {
        selectedDevices: new Set(),
        activeView: 'dashboard',
        filters: {},
        logs: []
      }
    };

    this.history = [];
    this.historyIndex = -1;
    this.maxHistorySize = options.maxHistorySize || 50;
    this.persistPath = options.persistPath || path.join(process.cwd(), 'state.json');
    this.autoSaveInterval = options.autoSaveInterval || 30000; // 30 secondes
    this.subscribers = new Map();
    this.middleware = [];

    // Démarrer l'auto-save si configuré
    if (options.autoSave !== false) {
      this.startAutoSave();
    }
  }

  /**
   * Initialiser le state depuis la persistance
   */
  async initialize() {
    try {
      await this.load();
      console.log('[StateManager] State loaded from persistence');
    } catch (error) {
      console.log('[StateManager] No previous state found, using default');
    }
  }

  /**
   * Obtenir une partie du state
   */
  get(path) {
    const parts = path.split('.');
    let current = this.state;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      // Gérer les Maps
      if (current instanceof Map) {
        current = current.get(part);
      } else if (current instanceof Set) {
        return current.has(part);
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Mettre à jour le state
   */
  set(path, value) {
    const oldState = this.cloneState();

    const parts = path.split('.');
    const lastPart = parts.pop();
    let current = this.state;

    // Naviguer jusqu'au parent
    for (const part of parts) {
      if (current instanceof Map) {
        if (!current.has(part)) {
          current.set(part, {});
        }
        current = current.get(part);
      } else {
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }
    }

    // Appliquer la valeur
    if (current instanceof Map) {
      current.set(lastPart, value);
    } else if (current instanceof Set) {
      if (value === true) {
        current.add(lastPart);
      } else {
        current.delete(lastPart);
      }
    } else {
      current[lastPart] = value;
    }

    // Appliquer les middleware
    for (const middleware of this.middleware) {
      middleware(this.state, oldState, { path, value });
    }

    // Ajouter à l'historique
    this.addToHistory(oldState);

    // Émettre l'événement de changement
    this.emit('state:changed', {
      path,
      oldValue: this.getFromState(oldState, path),
      newValue: value
    });

    // Notifier les subscribers
    this.notifySubscribers(path, value);

    return value;
  }

  /**
   * Mettre à jour plusieurs valeurs
   */
  setBatch(updates) {
    const oldState = this.cloneState();

    for (const [path, value] of Object.entries(updates)) {
      this.setWithoutHistory(path, value);
    }

    this.addToHistory(oldState);

    this.emit('state:batch-changed', { updates });
  }

  /**
   * Mettre à jour sans ajouter à l'historique
   */
  setWithoutHistory(path, value) {
    const parts = path.split('.');
    const lastPart = parts.pop();
    let current = this.state;

    for (const part of parts) {
      if (current instanceof Map) {
        if (!current.has(part)) {
          current.set(part, {});
        }
        current = current.get(part);
      } else {
        if (!(part in current)) {
          current[part] = {};
        }
        current = current[part];
      }
    }

    if (current instanceof Map) {
      current.set(lastPart, value);
    } else {
      current[lastPart] = value;
    }
  }

  /**
   * Obtenir depuis un état spécifique
   */
  getFromState(state, path) {
    const parts = path.split('.');
    let current = state;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (current instanceof Map) {
        current = current.get(part);
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Cloner l'état
   */
  cloneState() {
    return {
      devices: new Map(this.state.devices),
      sessions: new Map(this.state.sessions),
      processes: new Map(this.state.processes),
      config: { ...this.state.config },
      metrics: { ...this.state.metrics },
      ui: {
        ...this.state.ui,
        selectedDevices: new Set(this.state.ui.selectedDevices),
        filters: { ...this.state.ui.filters },
        logs: [...this.state.ui.logs]
      }
    };
  }

  /**
   * Ajouter à l'historique
   */
  addToHistory(state) {
    // Supprimer les états futurs si on n'est pas à la fin
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Ajouter le nouvel état
    this.history.push(state);

    // Limiter la taille de l'historique
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  /**
   * Annuler la dernière action
   */
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.state = this.cloneStateFromHistory(this.history[this.historyIndex]);

      this.emit('state:undo');
      return true;
    }
    return false;
  }

  /**
   * Refaire l'action annulée
   */
  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.state = this.cloneStateFromHistory(this.history[this.historyIndex]);

      this.emit('state:redo');
      return true;
    }
    return false;
  }

  /**
   * Cloner depuis l'historique
   */
  cloneStateFromHistory(historicalState) {
    return {
      devices: new Map(historicalState.devices),
      sessions: new Map(historicalState.sessions),
      processes: new Map(historicalState.processes),
      config: { ...historicalState.config },
      metrics: { ...historicalState.metrics },
      ui: {
        ...historicalState.ui,
        selectedDevices: new Set(historicalState.ui.selectedDevices),
        filters: { ...historicalState.ui.filters },
        logs: [...historicalState.ui.logs]
      }
    };
  }

  /**
   * S'abonner aux changements d'un chemin
   */
  subscribe(path, callback) {
    if (!this.subscribers.has(path)) {
      this.subscribers.set(path, new Set());
    }

    this.subscribers.get(path).add(callback);

    // Retourner la fonction de désabonnement
    return () => {
      const callbacks = this.subscribers.get(path);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(path);
        }
      }
    };
  }

  /**
   * Notifier les subscribers
   */
  notifySubscribers(path, value) {
    // Notifier les subscribers exacts
    const exactCallbacks = this.subscribers.get(path);
    if (exactCallbacks) {
      for (const callback of exactCallbacks) {
        callback(value, path);
      }
    }

    // Notifier les subscribers parents
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      const parentCallbacks = this.subscribers.get(parentPath);
      if (parentCallbacks) {
        for (const callback of parentCallbacks) {
          callback(this.get(parentPath), parentPath);
        }
      }
    }

    // Notifier les subscribers globaux
    const globalCallbacks = this.subscribers.get('*');
    if (globalCallbacks) {
      for (const callback of globalCallbacks) {
        callback(this.state, path);
      }
    }
  }

  /**
   * Ajouter un middleware
   */
  use(middleware) {
    this.middleware.push(middleware);
  }

  /**
   * Persister l'état
   */
  async save() {
    try {
      // Fonction pour nettoyer les objets non-sérialisables
      const cleanForSerialization = (obj) => {
        if (!obj || typeof obj !== 'object') return obj;

        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          // Ignorer les timers et fonctions
          if (key.startsWith('_') || key === 'timer' || typeof value === 'function') {
            continue;
          }
          // Ignorer les objets Timeout
          if (value && value.constructor && value.constructor.name === 'Timeout') {
            continue;
          }
          // Convertir les Sets en Arrays
          if (value instanceof Set) {
            cleaned[key] = Array.from(value);
          }
          // Convertir les Maps en Arrays
          else if (value instanceof Map) {
            cleaned[key] = Array.from(value.entries());
          }
          // Récursivement nettoyer les objets
          else if (value && typeof value === 'object' && !Array.isArray(value)) {
            cleaned[key] = cleanForSerialization(value);
          }
          else {
            cleaned[key] = value;
          }
        }
        return cleaned;
      };

      // Créer une version propre pour la sérialisation
      const serializable = {
        devices: Array.from(this.state.devices.entries()),
        sessions: Array.from(this.state.sessions.entries()).map(([k, v]) => [k, cleanForSerialization(v)]),
        processes: Array.from(this.state.processes.entries()).map(([k, v]) => [k, cleanForSerialization(v)]),
        config: this.state.config,
        metrics: this.state.metrics,
        ui: {
          ...this.state.ui,
          selectedDevices: Array.from(this.state.ui.selectedDevices),
          logs: this.state.ui.logs.slice(-100) // Garder seulement les 100 derniers logs
        },
        tasks: this.state.tasks ? cleanForSerialization(this.state.tasks) : {},
        timestamp: new Date().toISOString()
      };

      await fs.writeFile(
        this.persistPath,
        JSON.stringify(serializable, null, 2),
        'utf-8'
      );

      this.emit('state:saved');
    } catch (error) {
      console.error('[StateManager] Save error:', error.message);
      // Ne pas propager l'erreur pour éviter de crasher l'app
    }
  }

  /**
   * Charger l'état
   */
  async load() {
    const content = await fs.readFile(this.persistPath, 'utf-8');
    const data = JSON.parse(content);

    this.state = {
      devices: new Map(data.devices || []),
      sessions: new Map(data.sessions || []),
      processes: new Map(data.processes || []),
      config: data.config || {},
      metrics: data.metrics || {},
      ui: {
        ...data.ui,
        selectedDevices: new Set(data.ui?.selectedDevices || []),
        logs: data.ui?.logs || []
      }
    };

    this.emit('state:loaded');
  }

  /**
   * Démarrer l'auto-save
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      return;
    }

    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.save();
      } catch (error) {
        console.error('[StateManager] Auto-save failed:', error);
      }
    }, this.autoSaveInterval);
  }

  /**
   * Arrêter l'auto-save
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Réinitialiser l'état
   */
  reset() {
    this.state = {
      devices: new Map(),
      sessions: new Map(),
      processes: new Map(),
      config: {},
      metrics: {},
      ui: {
        selectedDevices: new Set(),
        activeView: 'dashboard',
        filters: {},
        logs: []
      }
    };

    this.history = [];
    this.historyIndex = -1;

    this.emit('state:reset');
  }

  /**
   * Obtenir un snapshot de l'état
   */
  getSnapshot() {
    return this.cloneState();
  }

  /**
   * Restaurer depuis un snapshot
   */
  restoreSnapshot(snapshot) {
    this.state = this.cloneStateFromHistory(snapshot);
    this.emit('state:restored');
  }

  /**
   * Obtenir les statistiques de l'état
   */
  getStats() {
    return {
      devicesCount: this.state.devices.size,
      sessionsCount: this.state.sessions.size,
      processesCount: this.state.processes.size,
      historySize: this.history.length,
      subscribersCount: this.subscribers.size,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  /**
   * Arrêter proprement
   */
  async shutdown() {
    console.log('[StateManager] Shutting down...');

    this.stopAutoSave();

    // Sauvegarder une dernière fois
    await this.save();

    this.removeAllListeners();
    this.subscribers.clear();
    this.middleware = [];

    console.log('[StateManager] Shutdown complete');
  }
}

module.exports = StateManager;