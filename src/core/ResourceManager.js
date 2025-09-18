const fs = require('fs').promises;
const path = require('path');

/**
 * ResourceManager - Gestionnaire centralisé des emails pour multi-appareils
 * Gère l'allocation thread-safe des emails sans recyclage
 */
class ResourceManager {
    constructor() {
        this.stateFile = path.join(__dirname, '../../config/app/emails-state.json');
        this.emailsFile = path.join(__dirname, '../../data/resources/emails.txt');
        this.state = {
            available: [],
            allocated: {}, // deviceId -> email
            used: [],
            stats: {
                totalEmails: 0,
                availableCount: 0,
                allocatedCount: 0,
                usedCount: 0
            }
        };
        this.initialized = false;
    }

    /**
     * Initialise le manager en chargeant l'état et les emails
     */
    async initialize() {
        if (this.initialized) return;

        console.log('[ResourceManager] Initializing emails...');

        // Créer le dossier config/app si nécessaire
        const configDir = path.dirname(this.stateFile);
        try {
            await fs.mkdir(configDir, { recursive: true });
        } catch (err) {
            // Dossier existe déjà, pas de problème
        }

        // Charger l'état existant ou créer un nouveau
        await this.loadState();

        // Charger les emails depuis le fichier texte si première fois
        if (this.state.stats.totalEmails === 0) {
            await this.loadEmailsFromFile();
        }

        this.initialized = true;
        console.log(`[ResourceManager] Initialized with ${this.state.available.length} available emails`);
    }

    /**
     * Charge l'état depuis le fichier JSON
     */
    async loadState() {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            this.state = JSON.parse(data);
            console.log('[ResourceManager] Email state loaded from file');
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('[ResourceManager] No existing email state file, creating new state');
                await this.saveState();
            } else {
                console.error('[ResourceManager] Error loading email state:', err);
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
            console.error('[ResourceManager] Error saving email state:', err);
        }
    }

    /**
     * Charge les emails depuis le fichier texte
     */
    async loadEmailsFromFile() {
        try {
            // Créer le dossier data/resources si nécessaire
            const resourceDir = path.dirname(this.emailsFile);
            try {
                await fs.mkdir(resourceDir, { recursive: true });
            } catch (err) {
                // Dossier existe déjà
            }

            // Lire le fichier emails
            const data = await fs.readFile(this.emailsFile, 'utf8');
            const emails = data.split('\n')
                .map(email => email.trim())
                .filter(email => email.length > 0 && email.includes('@'));

            console.log(`[ResourceManager] Loaded ${emails.length} emails from file`);

            // Filtrer les emails déjà utilisés
            const usedSet = new Set(this.state.used);
            const availableEmails = emails.filter(email => !usedSet.has(email));

            this.state.available = availableEmails;
            this.state.stats.totalEmails = emails.length;
            this.state.stats.availableCount = availableEmails.length;

            await this.saveState();
        } catch (err) {
            if (err.code === 'ENOENT') {
                console.log('[ResourceManager] No emails file found, creating sample file');
                // Créer un fichier d'exemple
                const sampleEmails = [
                    'test1@example.com',
                    'test2@example.com',
                    'test3@example.com'
                ].join('\n');
                await fs.writeFile(this.emailsFile, sampleEmails);
                this.state.available = ['test1@example.com', 'test2@example.com', 'test3@example.com'];
                this.state.stats.totalEmails = 3;
                this.state.stats.availableCount = 3;
                await this.saveState();
            } else {
                console.error('[ResourceManager] Error loading emails:', err);
            }
        }
    }

    /**
     * Alloue un email à un appareil
     * @param {string} deviceId - ID unique de l'appareil
     * @returns {string|null} Email alloué ou null si aucun disponible
     */
    async allocateEmail(deviceId) {
        await this.initialize();

        // Vérifier si l'appareil a déjà un email alloué
        if (this.state.allocated[deviceId]) {
            console.log(`[ResourceManager] Device ${deviceId} already has email allocated`);
            return this.state.allocated[deviceId];
        }

        // Vérifier s'il reste des emails disponibles
        if (this.state.available.length === 0) {
            console.log('[ResourceManager] No available emails');
            return null;
        }

        // Prendre le premier email disponible
        const email = this.state.available.shift();

        // Marquer comme alloué
        this.state.allocated[deviceId] = email;

        // Mettre à jour les stats
        this.updateStats();

        // Sauvegarder
        await this.saveState();

        console.log(`[ResourceManager] Allocated ${email} to device ${deviceId}`);
        return email;
    }

    /**
     * Marque un email comme utilisé
     * @param {string} deviceId - ID de l'appareil
     */
    async markEmailUsed(deviceId) {
        await this.initialize();

        const email = this.state.allocated[deviceId];
        if (!email) {
            console.log(`[ResourceManager] No email allocated for device ${deviceId}`);
            return;
        }

        // Retirer de allocated
        delete this.state.allocated[deviceId];

        // Ajouter dans used
        this.state.used.push(email);

        // Mettre à jour les stats et sauvegarder
        this.updateStats();
        await this.saveState();

        console.log(`[ResourceManager] Marked ${email} as used by device ${deviceId}`);
    }

    /**
     * Libère un email alloué (en cas d'échec)
     * @param {string} deviceId - ID de l'appareil
     */
    async releaseEmail(deviceId) {
        await this.initialize();

        const email = this.state.allocated[deviceId];
        if (!email) {
            console.log(`[ResourceManager] No email to release for device ${deviceId}`);
            return;
        }

        // Retirer de allocated
        delete this.state.allocated[deviceId];

        // Remettre dans available
        this.state.available.unshift(email); // Remettre au début pour réutilisation rapide

        // Mettre à jour les stats et sauvegarder
        this.updateStats();
        await this.saveState();

        console.log(`[ResourceManager] Released ${email} from device ${deviceId}`);
    }

    /**
     * Met à jour les statistiques
     */
    updateStats() {
        this.state.stats.availableCount = this.state.available.length;
        this.state.stats.allocatedCount = Object.keys(this.state.allocated).length;
        this.state.stats.usedCount = this.state.used.length;
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
            allocated: Object.keys(this.state.allocated).length,
            used: this.state.used.length,
            stats: this.state.stats
        };
    }

    /**
     * Ajoute de nouveaux emails au pool
     * @param {string[]} emails - Liste d'emails à ajouter
     */
    async addEmails(emails) {
        await this.initialize();

        // Filtrer les emails déjà connus
        const knownEmails = new Set([
            ...this.state.available,
            ...Object.values(this.state.allocated),
            ...this.state.used
        ]);

        const newEmails = emails.filter(email => !knownEmails.has(email) && email.includes('@'));

        if (newEmails.length > 0) {
            this.state.available.push(...newEmails);
            this.state.stats.totalEmails += newEmails.length;
            this.updateStats();
            await this.saveState();

            // Mettre à jour le fichier texte aussi
            const allEmails = [
                ...this.state.available,
                ...Object.values(this.state.allocated),
                ...this.state.used
            ];
            await fs.writeFile(this.emailsFile, allEmails.join('\n'));

            console.log(`[ResourceManager] Added ${newEmails.length} new emails`);
        }

        return newEmails.length;
    }
}

module.exports = ResourceManager;