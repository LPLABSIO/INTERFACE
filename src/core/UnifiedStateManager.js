const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

/**
 * Gestionnaire d'état unifié pour centraliser tous les états de l'application
 * Remplace progressivement les multiples fichiers JSON par un système centralisé
 * avec support de la rétrocompatibilité
 */
class UnifiedStateManager extends EventEmitter {
  constructor(options = {}) {
    super();

    // Configuration
    this.mainStatePath = options.mainStatePath || path.join(__dirname, '../../data/unified-state.json');
    this.backupPath = this.mainStatePath + '.backup';
    this.lockFile = this.mainStatePath + '.lock';

    // État en mémoire avec namespaces
    this.state = {
      version: '1.0.0',
      ui: {},        // Remplace data/state.json
      queue: {},     // Remplace config/app/queue-state.json
      servers: {},   // Remplace config/app/appium_servers.json
      locations: {}, // Remplace config/app/locations-state.json
      resources: {}, // Remplace config/app/emails-state.json
      metrics: {},   // Nouveau: métriques centralisées
      timestamp: new Date().toISOString()
    };

    // Mapping vers les anciens fichiers pour rétrocompatibilité
    this.legacyMappings = {
      ui: path.join(__dirname, '../../data/state.json'),
      queue: path.join(__dirname, '../../config/app/queue-state.json'),
      servers: path.join(__dirname, '../../config/app/appium_servers.json'),
      locations: path.join(__dirname, '../../config/app/locations-state.json'),
      resources: path.join(__dirname, '../../config/app/emails-state.json')
    };

    // Options
    this.enableLegacySync = options.enableLegacySync !== false; // true par défaut
    this.autoSave = options.autoSave !== false;
    this.autoSaveInterval = options.autoSaveInterval || 5000; // 5 secondes
    this.maxBackups = options.maxBackups || 5;

    // État interne
    this.isInitialized = false;
    this.isDirty = false;
    this.saveTimer = null;
    this.writeLock = false;
    this.writeQueue = [];
  }

  /**
   * Initialise le gestionnaire d'état
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('[UnifiedStateManager] Initializing...');

    try {
      // Créer les répertoires nécessaires
      await this.ensureDirectories();

      // Charger l'état unifié ou migrer depuis les anciens fichiers
      const loaded = await this.loadUnifiedState();

      if (!loaded && this.enableLegacySync) {
        console.log('[UnifiedStateManager] No unified state found, migrating from legacy files...');
        await this.migrateFromLegacy();
      }

      // Démarrer l'auto-save si activé
      if (this.autoSave) {
        this.startAutoSave();
      }

      this.isInitialized = true;
      console.log('[UnifiedStateManager] Initialized successfully');
      this.emit('initialized');

    } catch (error) {
      console.error('[UnifiedStateManager] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Crée les répertoires nécessaires
   */
  async ensureDirectories() {
    const dirs = [
      path.dirname(this.mainStatePath),
      ...Object.values(this.legacyMappings).map(p => path.dirname(p))
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Charge l'état unifié depuis le fichier
   */
  async loadUnifiedState() {
    try {
      const data = await fs.readFile(this.mainStatePath, 'utf8');
      this.state = JSON.parse(data);
      console.log('[UnifiedStateManager] Loaded unified state');
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Fichier n'existe pas
      }
      throw error;
    }
  }

  /**
   * Migre les données depuis les anciens fichiers
   */
  async migrateFromLegacy() {
    console.log('[UnifiedStateManager] Starting migration from legacy files...');

    for (const [namespace, filePath] of Object.entries(this.legacyMappings)) {
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const parsed = JSON.parse(data);
        this.state[namespace] = parsed;
        console.log(`[UnifiedStateManager] Migrated ${namespace} from ${filePath}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`[UnifiedStateManager] Failed to migrate ${namespace}:`, error.message);
        }
        // Initialiser avec une structure vide si le fichier n'existe pas
        this.state[namespace] = this.getDefaultStructure(namespace);
      }
    }

    // Sauvegarder l'état migré
    await this.saveState();
    console.log('[UnifiedStateManager] Migration completed');
  }

  /**
   * Retourne la structure par défaut pour un namespace
   */
  getDefaultStructure(namespace) {
    const defaults = {
      ui: {
        devices: [],
        sessions: [],
        processes: [],
        config: {},
        metrics: {},
        ui: { selectedDevices: [], activeView: 'dashboard', filters: {}, logs: [] },
        tasks: {},
        timestamp: new Date().toISOString()
      },
      queue: {
        tasks: [],
        stats: { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0 },
        deviceAssignments: {}
      },
      servers: {
        servers: []
      },
      locations: {
        available: [],
        used: []
      },
      resources: {
        emails: [],
        proxies: []
      },
      metrics: {
        performance: {},
        errors: [],
        stats: {}
      }
    };

    return defaults[namespace] || {};
  }

  /**
   * Obtient une partie de l'état par namespace et chemin
   * @param {string} namespace - Le namespace (ui, queue, servers, etc.)
   * @param {string} path - Chemin pointé vers la donnée (ex: "stats.total")
   */
  get(namespace, path = null) {
    if (!this.state[namespace]) {
      return undefined;
    }

    if (!path) {
      return this.state[namespace];
    }

    // Navigation dans l'objet avec le chemin pointé
    const keys = path.split('.');
    let current = this.state[namespace];

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return undefined;
      }
    }

    return current;
  }

  /**
   * Définit une partie de l'état
   * @param {string} namespace - Le namespace
   * @param {string} path - Chemin pointé ou null pour remplacer tout le namespace
   * @param {any} value - La valeur à définir
   */
  async set(namespace, path, value) {
    // Si path est en fait la valeur (2 arguments seulement)
    if (arguments.length === 2) {
      value = path;
      path = null;
    }

    // Créer le namespace s'il n'existe pas
    if (!this.state[namespace]) {
      this.state[namespace] = {};
    }

    if (!path) {
      // Remplacer tout le namespace
      this.state[namespace] = value;
    } else {
      // Navigation et mise à jour avec le chemin pointé
      const keys = path.split('.');
      const lastKey = keys.pop();
      let current = this.state[namespace];

      for (const key of keys) {
        if (!current[key] || typeof current[key] !== 'object') {
          current[key] = {};
        }
        current = current[key];
      }

      current[lastKey] = value;
    }

    this.state.timestamp = new Date().toISOString();
    this.isDirty = true;

    // Émettre un événement de changement
    this.emit('change', { namespace, path, value });

    // Synchroniser avec les anciens fichiers si activé
    if (this.enableLegacySync) {
      await this.syncToLegacy(namespace);
    }

    // Déclencher la sauvegarde automatique
    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Met à jour partiellement un namespace
   * @param {string} namespace - Le namespace
   * @param {object} updates - Les mises à jour à appliquer
   */
  async update(namespace, updates) {
    if (!this.state[namespace]) {
      this.state[namespace] = {};
    }

    // Fusion profonde
    this.state[namespace] = this.deepMerge(this.state[namespace], updates);
    this.state.timestamp = new Date().toISOString();
    this.isDirty = true;

    this.emit('change', { namespace, updates });

    if (this.enableLegacySync) {
      await this.syncToLegacy(namespace);
    }

    if (this.autoSave) {
      this.scheduleSave();
    }
  }

  /**
   * Fusion profonde de deux objets
   */
  deepMerge(target, source) {
    const output = Object.assign({}, target);

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  /**
   * Vérifie si une valeur est un objet
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Synchronise un namespace vers son fichier legacy
   */
  async syncToLegacy(namespace) {
    if (!this.legacyMappings[namespace]) {
      return;
    }

    try {
      const filePath = this.legacyMappings[namespace];
      const data = JSON.stringify(this.state[namespace], null, 2);

      // Écriture atomique avec fichier temporaire
      const tempPath = filePath + '.tmp';
      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, filePath);

      console.log(`[UnifiedStateManager] Synced ${namespace} to legacy file`);
    } catch (error) {
      console.error(`[UnifiedStateManager] Failed to sync ${namespace} to legacy:`, error);
    }
  }

  /**
   * Programme une sauvegarde différée
   */
  scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveState().catch(error => {
        console.error('[UnifiedStateManager] Auto-save failed:', error);
      });
    }, 1000); // Délai de 1 seconde pour regrouper les changements
  }

  /**
   * Sauvegarde l'état complet
   */
  async saveState() {
    if (!this.isDirty) {
      return;
    }

    // File d'attente pour éviter les écritures concurrentes
    if (this.writeLock) {
      return new Promise((resolve, reject) => {
        this.writeQueue.push({ resolve, reject });
      });
    }

    this.writeLock = true;

    try {
      // Créer une sauvegarde
      await this.createBackup();

      // Replacer pour éviter les références circulaires
      const seen = new WeakSet();
      const replacer = (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      };

      // Écriture atomique
      const data = JSON.stringify(this.state, replacer, 2);
      const tempPath = this.mainStatePath + '.tmp';

      await fs.writeFile(tempPath, data);
      await fs.rename(tempPath, this.mainStatePath);

      this.isDirty = false;
      console.log('[UnifiedStateManager] State saved');
      this.emit('saved');

    } catch (error) {
      console.error('[UnifiedStateManager] Save failed:', error);
      throw error;
    } finally {
      this.writeLock = false;

      // Traiter la file d'attente
      while (this.writeQueue.length > 0) {
        const { resolve } = this.writeQueue.shift();
        resolve();
      }
    }
  }

  /**
   * Crée une sauvegarde de l'état actuel
   */
  async createBackup() {
    try {
      // Copier le fichier actuel comme backup
      await fs.copyFile(this.mainStatePath, this.backupPath);

      // Rotation des backups
      for (let i = this.maxBackups - 1; i > 0; i--) {
        const oldPath = `${this.backupPath}.${i}`;
        const newPath = `${this.backupPath}.${i + 1}`;

        try {
          await fs.rename(oldPath, newPath);
        } catch (e) {
          // Ignorer si le fichier n'existe pas
        }
      }

      // Renommer le backup actuel
      await fs.rename(this.backupPath, `${this.backupPath}.1`);

    } catch (error) {
      // Ignorer les erreurs de backup
      if (error.code !== 'ENOENT') {
        console.warn('[UnifiedStateManager] Backup failed:', error.message);
      }
    }
  }

  /**
   * Démarre la sauvegarde automatique
   */
  startAutoSave() {
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveState().catch(error => {
          console.error('[UnifiedStateManager] Auto-save failed:', error);
        });
      }
    }, this.autoSaveInterval);
  }

  /**
   * Arrête la sauvegarde automatique
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Effectue une transaction atomique
   * @param {Function} operation - Fonction contenant les opérations
   */
  async transaction(operation) {
    const backup = JSON.parse(JSON.stringify(this.state));

    try {
      await operation(this);
      await this.saveState();
    } catch (error) {
      // Rollback en cas d'erreur
      this.state = backup;
      throw error;
    }
  }

  /**
   * Méthode de compatibilité pour AppOrchestrator
   * Support des chemins imbriqués (ex: "devices.123.name")
   */
  set(fullPath, value) {
    const parts = fullPath.split('.');
    const namespace = this.determineNamespace(parts[0]);

    // Créer le namespace s'il n'existe pas
    if (!this.state[namespace]) {
      this.state[namespace] = this.getDefaultStructure(namespace);
    }

    // Naviguer et créer la structure si nécessaire
    let current = this.state[namespace];
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]];
    }

    // Définir la valeur
    current[parts[parts.length - 1]] = value;
    this.isDirty = true;
    this.emit('state:changed', { namespace, path: fullPath, value });
  }

  /**
   * Méthode de compatibilité pour AppOrchestrator
   * Supporte l'accès par chemin imbriqué
   */
  get(pathOrNamespace, path = null) {
    // Si c'est un appel legacy avec un seul argument (chemin complet)
    if (path === null && pathOrNamespace && pathOrNamespace.includes('.')) {
      const parts = pathOrNamespace.split('.');
      const namespace = this.determineNamespace(parts[0]);

      if (!this.state[namespace]) {
        return undefined;
      }

      let current = this.state[namespace];
      for (const part of parts) {
        if (current === undefined || current === null) {
          return undefined;
        }
        current = current[part];
      }
      return current;
    }

    // Appel standard avec namespace
    const namespace = pathOrNamespace;
    if (!this.state[namespace]) {
      return undefined;
    }

    if (!path) {
      return this.state[namespace];
    }

    // Naviguer dans le chemin
    const parts = path.split('.');
    let result = this.state[namespace];

    for (const part of parts) {
      if (result === undefined || result === null) {
        return undefined;
      }
      result = result[part];
    }

    return result;
  }

  /**
   * Méthode de compatibilité pour supprimer une valeur
   */
  delete(fullPath) {
    const parts = fullPath.split('.');
    const namespace = this.determineNamespace(parts[0]);

    if (!this.state[namespace]) {
      return;
    }

    // Naviguer jusqu'à l'objet parent
    let current = this.state[namespace];
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        return;
      }
      current = current[parts[i]];
    }

    // Supprimer la propriété
    delete current[parts[parts.length - 1]];

    this.isDirty = true;
    this.emit('state:changed', { namespace, path: fullPath, value: undefined });
  }

  /**
   * Détermine le namespace approprié pour un chemin
   */
  determineNamespace(firstPart) {
    const namespaceMap = {
      'devices': 'ui',
      'sessions': 'ui',
      'processes': 'ui',
      'tasks': 'ui',
      'checkpoints': 'ui',
      'health': 'ui',
      'alerts': 'ui',
      'servers': 'servers',
      'queue': 'queue',
      'locations': 'locations',
      'resources': 'resources'
    };

    return namespaceMap[firstPart] || 'ui';
  }

  /**
   * Méthode de compatibilité pour subscription
   */
  subscribe(path, callback) {
    // Convertir en événement
    const eventName = `state:changed:${path}`;
    this.on(eventName, callback);
    return () => this.off(eventName, callback);
  }

  /**
   * Restaure depuis une sauvegarde
   * @param {number} backupIndex - Index de la sauvegarde (1 = plus récente)
   */
  async restoreFromBackup(backupIndex = 1) {
    const backupPath = `${this.backupPath}.${backupIndex}`;

    try {
      const data = await fs.readFile(backupPath, 'utf8');
      this.state = JSON.parse(data);
      await this.saveState();

      console.log(`[UnifiedStateManager] Restored from backup ${backupIndex}`);
      this.emit('restored', backupIndex);

    } catch (error) {
      console.error(`[UnifiedStateManager] Restore failed:`, error);
      throw error;
    }
  }

  /**
   * Nettoie et compacte l'état
   */
  async cleanup() {
    // Supprimer les entrées obsolètes
    // Par exemple, les tâches complétées de plus de 7 jours
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    if (this.state.queue && this.state.queue.tasks) {
      this.state.queue.tasks = this.state.queue.tasks.filter(task => {
        if (task.status === 'completed' && task.completedAt) {
          return new Date(task.completedAt) > oneWeekAgo;
        }
        return true;
      });
    }

    await this.saveState();
    console.log('[UnifiedStateManager] Cleanup completed');
  }

  /**
   * Arrête proprement le gestionnaire d'état
   */
  async shutdown() {
    this.stopAutoSave();
    if (this.isDirty) {
      await this.saveState();
    }
    this.removeAllListeners();
    console.log('[UnifiedStateManager] Shutdown complete');
  }

  /**
   * Obtient des statistiques sur l'état
   */
  getStats() {
    const stats = {
      namespaces: Object.keys(this.state).filter(k => !['version', 'timestamp'].includes(k)),
      size: JSON.stringify(this.state).length,
      lastModified: this.state.timestamp,
      isDirty: this.isDirty
    };

    // Compter les éléments par namespace
    for (const namespace of stats.namespaces) {
      const data = this.state[namespace];
      if (Array.isArray(data)) {
        stats[`${namespace}Count`] = data.length;
      } else if (typeof data === 'object') {
        stats[`${namespace}Keys`] = Object.keys(data).length;
      }
    }

    return stats;
  }

  /**
   * Arrête proprement le gestionnaire
   */
  async shutdown() {
    console.log('[UnifiedStateManager] Shutting down...');

    // Arrêter l'auto-save
    this.stopAutoSave();

    // Sauvegarder si nécessaire
    if (this.isDirty) {
      await this.saveState();
    }

    // Nettoyer les timers
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.emit('shutdown');
    console.log('[UnifiedStateManager] Shutdown complete');
  }
}

// Export singleton pour utilisation globale
let instance = null;

module.exports = {
  UnifiedStateManager,

  // Obtenir l'instance singleton
  getInstance: (options = {}) => {
    if (!instance) {
      instance = new UnifiedStateManager(options);
    }
    return instance;
  },

  // Réinitialiser l'instance (utile pour les tests)
  resetInstance: () => {
    if (instance) {
      instance.shutdown();
    }
    instance = null;
  }
};