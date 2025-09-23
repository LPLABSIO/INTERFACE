const fs = require('fs').promises;
const path = require('path');

/**
 * Sauvegarde les informations d'un compte Hinge créé
 */
class HingeAccountLogger {
  constructor() {
    this.logDir = path.join(__dirname, '../../data/accounts/hinge');
    this.logFile = path.join(this.logDir, `hinge_accounts_${new Date().toISOString().split('T')[0]}.json`);
  }

  /**
   * Initialise le dossier de logs s'il n'existe pas
   */
  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });

      // Créer le fichier s'il n'existe pas
      try {
        await fs.access(this.logFile);
      } catch {
        await fs.writeFile(this.logFile, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Failed to initialize account logger:', error);
    }
  }

  /**
   * Enregistre un nouveau compte créé
   */
  async logAccount(accountData) {
    try {
      await this.init();

      // Lire les comptes existants
      const data = await fs.readFile(this.logFile, 'utf8');
      const accounts = JSON.parse(data);

      // Ajouter le nouveau compte avec timestamp
      const accountEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        device: process.env.APPIUM_UDID || 'unknown',
        status: 'created',
        ...accountData,
        // Ne pas logger les mots de passe en clair
        credentials: {
          email: accountData.email,
          phone: accountData.phone?.number ?
            accountData.phone.number.substring(0, 4) + '****' : 'N/A'
        }
      };

      accounts.push(accountEntry);

      // Sauvegarder
      await fs.writeFile(this.logFile, JSON.stringify(accounts, null, 2));

      console.log(`✅ Account logged: ${accountEntry.id}`);
      return accountEntry.id;

    } catch (error) {
      console.error('Failed to log account:', error);
      return null;
    }
  }

  /**
   * Met à jour le statut d'un compte
   */
  async updateAccountStatus(accountId, status, additionalData = {}) {
    try {
      const data = await fs.readFile(this.logFile, 'utf8');
      const accounts = JSON.parse(data);

      const accountIndex = accounts.findIndex(acc => acc.id === accountId);
      if (accountIndex !== -1) {
        accounts[accountIndex] = {
          ...accounts[accountIndex],
          status,
          lastUpdated: new Date().toISOString(),
          ...additionalData
        };

        await fs.writeFile(this.logFile, JSON.stringify(accounts, null, 2));
        console.log(`✅ Account ${accountId} updated: ${status}`);
      }
    } catch (error) {
      console.error('Failed to update account status:', error);
    }
  }

  /**
   * Récupère les statistiques des comptes
   */
  async getStats() {
    try {
      const data = await fs.readFile(this.logFile, 'utf8');
      const accounts = JSON.parse(data);

      const stats = {
        total: accounts.length,
        created: accounts.filter(a => a.status === 'created').length,
        active: accounts.filter(a => a.status === 'active').length,
        banned: accounts.filter(a => a.status === 'banned').length,
        error: accounts.filter(a => a.status === 'error').length,
        byDevice: {}
      };

      // Stats par device
      accounts.forEach(acc => {
        const device = acc.device || 'unknown';
        if (!stats.byDevice[device]) {
          stats.byDevice[device] = 0;
        }
        stats.byDevice[device]++;
      });

      return stats;

    } catch (error) {
      console.error('Failed to get stats:', error);
      return null;
    }
  }

  /**
   * Export des comptes au format CSV
   */
  async exportToCSV() {
    try {
      const data = await fs.readFile(this.logFile, 'utf8');
      const accounts = JSON.parse(data);

      let csv = 'ID,Timestamp,Email,Phone,Status,Device,City,FirstName\\n';

      accounts.forEach(acc => {
        csv += `${acc.id},${acc.timestamp},${acc.credentials.email},${acc.credentials.phone},`;
        csv += `${acc.status},${acc.device},${acc.location?.city || 'N/A'},`;
        csv += `${acc.profile?.firstName || 'N/A'}\\n`;
      });

      const csvFile = path.join(this.logDir, `export_${Date.now()}.csv`);
      await fs.writeFile(csvFile, csv);

      console.log(`✅ Exported to: ${csvFile}`);
      return csvFile;

    } catch (error) {
      console.error('Failed to export CSV:', error);
      return null;
    }
  }
}

module.exports = HingeAccountLogger;