const fs = require('fs').promises;
const path = require('path');

/**
 * LocationManager - Gestionnaire centralisé des villes pour multi-appareils
 * Gère l'allocation thread-safe des villes avec tracking persistant
 */
class LocationManager {
    constructor() {
        this.stateFile = path.join(__dirname, '../../config/app/locations-state.json');
        this.locationsCSV = path.join(__dirname, '../../HINGE/locations_usa_tinder.csv');
        this.state = {
            available: [],
            testing: {}, // deviceId -> location
            used: [],
            blacklisted: [],
            failures: {}, // city -> attemptCount
            stats: {
                totalLocations: 0,
                availableCount: 0,
                usedCount: 0,
                blacklistedCount: 0,
                testingCount: 0
            }
        };
        this.initialized = false;
        this.lockMap = new Map(); // Pour éviter les accès concurrents
    }

    /**
     * Initialise le manager en chargeant l'état et les locations
     */
    async initialize() {
        if (this.initialized) return;

        console.log('[LocationManager] Initializing...');

        // Créer le dossier config/app si nécessaire
        const configDir = path.dirname(this.stateFile);
        try {
            await fs.mkdir(configDir, { recursive: true });
        } catch (err) {
            // Dossier existe déjà, pas de problème
        }

        // Charger l'état existant ou créer un nouveau
        await this.loadState();

        // Charger les locations depuis le CSV si première fois
        if (this.state.stats.totalLocations === 0) {
            await this.loadLocationsFromCSV();
        }

        this.initialized = true;
        console.log(`[LocationManager] Initialized with ${this.state.available.length} available locations`);
    }

    /**
     * Charge l'état depuis le fichier JSON
     */
    async loadState() {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            this.state = JSON.parse(data);
            console.log('[LocationManager] State loaded from file');
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('[LocationManager] No existing state file, creating new state');
                await this.saveState();
            } else {
                console.error('[LocationManager] Error loading state:', err);
            }
        }
    }

    /**
     * Sauvegarde l'état dans le fichier JSON
     */
    async saveState() {
        try {
            await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
        } catch (err) {
            console.error('[LocationManager] Error saving state:', err);
        }
    }

    /**
     * Charge les locations depuis le fichier CSV
     */
    async loadLocationsFromCSV() {
        try {
            const csv = require('csv-parser');
            const stream = require('fs').createReadStream(this.locationsCSV);
            const locations = [];

            return new Promise((resolve, reject) => {
                stream
                    .pipe(csv())
                    .on('data', (data) => locations.push(data))
                    .on('end', async () => {
                        console.log(`[LocationManager] Loaded ${locations.length} locations from CSV`);
                        this.state.available = locations;
                        this.state.stats.totalLocations = locations.length;
                        this.state.stats.availableCount = locations.length;
                        await this.saveState();
                        resolve();
                    })
                    .on('error', reject);
            });
        } catch (err) {
            console.error('[LocationManager] Error loading CSV:', err);
            // Fallback: créer quelques locations de test
            this.state.available = [
                { city: 'New York', state: 'NY', lat: '40.7128', lon: '-74.0060', CountryCode: 'US' },
                { city: 'Los Angeles', state: 'CA', lat: '34.0522', lon: '-118.2437', CountryCode: 'US' },
                { city: 'Chicago', state: 'IL', lat: '41.8781', lon: '-87.6298', CountryCode: 'US' }
            ];
            this.state.stats.totalLocations = 3;
            this.state.stats.availableCount = 3;
            await this.saveState();
        }
    }

    /**
     * Alloue une ville à un appareil
     * @param {string} deviceId - ID unique de l'appareil
     * @returns {Object|null} Location allouée ou null si aucune disponible
     */
    async allocate(deviceId) {
        await this.initialize();

        // Vérifier si l'appareil a déjà une ville en test
        if (this.state.testing[deviceId]) {
            console.log(`[LocationManager] Device ${deviceId} already has location in testing`);
            return this.state.testing[deviceId];
        }

        // Si plus de villes disponibles, tenter un reset automatique
        if (this.state.available.length === 0) {
            console.log('[LocationManager] No available locations, attempting auto-reset...');
            await this.reset();

            if (this.state.available.length === 0) {
                console.log('[LocationManager] Still no locations after reset');
                return null;
            }
        }

        // Prendre la première ville disponible
        const location = this.state.available.shift();

        // Marquer comme en test
        this.state.testing[deviceId] = location;

        // Mettre à jour les stats
        this.updateStats();

        // Sauvegarder
        await this.saveState();

        console.log(`[LocationManager] Allocated ${location.city} to device ${deviceId}`);
        return location;
    }

    /**
     * Libère une ville après un échec de test
     * @param {string} deviceId - ID de l'appareil
     * @param {Object} location - Ville à libérer
     */
    async release(deviceId, location) {
        await this.initialize();

        // Retirer du testing
        delete this.state.testing[deviceId];

        // Incrémenter le compteur d'échecs
        const cityKey = location.city;
        if (!this.state.failures[cityKey]) {
            this.state.failures[cityKey] = 0;
        }
        this.state.failures[cityKey]++;

        // Si moins de 3 échecs, remettre dans available
        if (this.state.failures[cityKey] < 3) {
            console.log(`[LocationManager] Released ${location.city} (attempt ${this.state.failures[cityKey]}/3)`);
            this.state.available.push(location);
        } else {
            // Après 3 échecs, blacklister
            console.log(`[LocationManager] Blacklisting ${location.city} after 3 failures`);
            this.state.blacklisted.push(location);
            delete this.state.failures[cityKey];
        }

        // Mettre à jour les stats et sauvegarder
        this.updateStats();
        await this.saveState();
    }

    /**
     * Marque une ville comme utilisée avec succès
     * @param {string} deviceId - ID de l'appareil
     * @param {Object} location - Ville utilisée
     */
    async markUsed(deviceId, location) {
        await this.initialize();

        // Retirer du testing
        delete this.state.testing[deviceId];

        // Ajouter dans used
        this.state.used.push(location);

        // Retirer du compteur d'échecs si présent
        delete this.state.failures[location.city];

        // Mettre à jour les stats et sauvegarder
        this.updateStats();
        await this.saveState();

        console.log(`[LocationManager] Marked ${location.city} as used by device ${deviceId}`);
    }

    /**
     * Reset complet : remet toutes les villes dans available
     */
    async reset() {
        await this.initialize();

        console.log('[LocationManager] Performing full reset...');

        // Récupérer toutes les villes
        const allLocations = [
            ...this.state.available,
            ...this.state.used,
            ...this.state.blacklisted,
            ...Object.values(this.state.testing)
        ];

        // Réinitialiser l'état
        this.state.available = allLocations;
        this.state.testing = {};
        this.state.used = [];
        this.state.blacklisted = [];
        this.state.failures = {};

        // Mettre à jour les stats et sauvegarder
        this.updateStats();
        await this.saveState();

        console.log(`[LocationManager] Reset complete. ${this.state.available.length} locations available`);
    }

    /**
     * Met à jour les statistiques
     */
    updateStats() {
        this.state.stats.availableCount = this.state.available.length;
        this.state.stats.usedCount = this.state.used.length;
        this.state.stats.blacklistedCount = this.state.blacklisted.length;
        this.state.stats.testingCount = Object.keys(this.state.testing).length;
    }

    /**
     * Retourne les statistiques actuelles
     */
    getStats() {
        return { ...this.state.stats };
    }

    /**
     * Retourne l'état complet (pour debug/monitoring)
     */
    getState() {
        return {
            available: this.state.available.length,
            testing: Object.keys(this.state.testing).length,
            used: this.state.used.length,
            blacklisted: this.state.blacklisted.length,
            failures: Object.keys(this.state.failures).length,
            stats: this.state.stats
        };
    }
}

module.exports = LocationManager;