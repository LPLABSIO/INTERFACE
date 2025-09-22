const fs = require('fs').promises;
const path = require('path');

/**
 * Gestionnaire d'emails avec fichiers séparés par application
 */
class EmailManager {
  constructor(app) {
    this.app = app.toLowerCase();
    this.emailsFile = path.join(__dirname, `../../DATA/resources/emails/${this.app}_emails.txt`);
    this.stateFile = path.join(__dirname, `../../DATA/resources/emails/${this.app}_emails_state.json`);

    this.state = {
      available: [],
      used: [],
      blacklisted: []
    };
  }

  /**
   * Initialise le gestionnaire en chargeant les emails
   */
  async initialize() {
    console.log(`[EmailManager] Initialisation pour ${this.app}...`);

    // Charger les emails depuis le fichier
    try {
      const content = await fs.readFile(this.emailsFile, 'utf8');
      const emails = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));

      // Charger l'état si existe
      try {
        const stateData = await fs.readFile(this.stateFile, 'utf8');
        this.state = JSON.parse(stateData);
      } catch (e) {
        // Première fois, initialiser l'état
        this.state.available = emails;
        await this.saveState();
      }

      console.log(`[EmailManager] ${this.state.available.length} emails disponibles pour ${this.app}`);
    } catch (error) {
      console.error(`[EmailManager] Erreur chargement emails:`, error);
      throw error;
    }
  }

  /**
   * Alloue un email pour un device
   * @param {string} deviceId - ID du device
   * @returns {string} email alloué
   */
  async allocateEmail(deviceId) {
    if (this.state.available.length === 0) {
      throw new Error(`Plus d'emails disponibles pour ${this.app}`);
    }

    const email = this.state.available.shift();
    this.state.used.push({
      email,
      deviceId,
      allocatedAt: new Date().toISOString()
    });

    await this.saveState();
    console.log(`[EmailManager] Email alloué pour ${deviceId}: ${email}`);
    return email;
  }

  /**
   * Marque un email comme blacklisté
   * @param {string} email - Email à blacklister
   * @param {string} reason - Raison du blacklist
   */
  async blacklistEmail(email, reason) {
    // Retirer des available si présent
    const index = this.state.available.indexOf(email);
    if (index > -1) {
      this.state.available.splice(index, 1);
    }

    // Ajouter au blacklist
    this.state.blacklisted.push({
      email,
      reason,
      blacklistedAt: new Date().toISOString()
    });

    await this.saveState();
    console.log(`[EmailManager] Email blacklisté: ${email} (${reason})`);
  }

  /**
   * Sauvegarde l'état
   */
  async saveState() {
    await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2));
  }

  /**
   * Obtient les statistiques
   */
  getStats() {
    return {
      app: this.app,
      available: this.state.available.length,
      used: this.state.used.length,
      blacklisted: this.state.blacklisted.length,
      total: this.state.available.length + this.state.used.length + this.state.blacklisted.length
    };
  }

  /**
   * Récupère et retire un email du fichier (ancienne méthode pour compatibilité)
   * @deprecated Utiliser allocateEmail() à la place
   */
  static async getAndRemoveEmail(filename) {
    const app = filename.replace('email_', '').replace('.txt', '');
    const manager = new EmailManager(app);
    await manager.initialize();
    return await manager.allocateEmail('legacy');
  }
}

module.exports = EmailManager;