const axios = require('axios');
const { log } = require('../utils/utils');

class QuixEmailService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://quix.email/api/v1';
    this.currentEmail = null;
    this.activationId = null;
  }

  /**
   * Génère un nouvel email Gmail temporaire via l'API Quix
   * @returns {Promise<string>} L'adresse email générée
   */
  async generateEmail() {
    try {
      log('Requesting new Gmail address from Quix API...');

      const response = await axios.get(`${this.baseURL}/${this.apiKey}/emailGet`, {
        params: {
          site: 'hinge.co',  // Le site depuis lequel l'email sera envoyé
          domain: 'gmail.com' // Domaine Gmail spécifiquement
        }
      });

      if (response.data && response.data.success) {
        const result = response.data.result;
        this.currentEmail = result.email;
        this.activationId = result.id;
        log(`Quix Gmail generated: ${this.currentEmail.substring(0, 5)}***@gmail.com`);
        return this.currentEmail;
      }

      throw new Error(response.data?.error || 'Failed to generate email from Quix API');
    } catch (error) {
      log(`Error generating Quix email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Récupère le statut et le contenu de l'email d'activation
   * @param {number} timeout - Timeout en ms (par défaut 120 secondes)
   * @returns {Promise<Object>} Le contenu de l'email
   */
  async getEmailContent(timeout = 120000) {
    if (!this.activationId) {
      throw new Error('No activation ID available. Generate an email first.');
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(`${this.baseURL}/${this.apiKey}/emailStatus`, {
          params: {
            id: this.activationId
          }
        });

        if (response.data && response.data.success) {
          const result = response.data.result;

          // Si l'email est reçu (statut "completed")
          if (result.status === 'completed' && result.email_content) {
            log('Email received from Hinge');
            return result.email_content;
          }
        }
      } catch (error) {
        log(`Error fetching email status: ${error.message}`);
      }

      // Attendre 3 secondes avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    log('Timeout waiting for Quix email');
    return null;
  }

  /**
   * Extrait le code Hinge depuis le contenu de l'email
   * @param {number} timeout - Timeout en ms
   * @returns {Promise<string>} Le code de vérification Hinge
   */
  async getHingeCode(timeout = 120000) {
    log('Waiting for Hinge verification code from Quix...');

    const emailContent = await this.getEmailContent(timeout);

    if (emailContent) {
      // Chercher le code dans le contenu de l'email
      // Pattern pour trouver un code à 6 chiffres
      const codeMatch = emailContent.match(/\b(\d{6})\b/);

      if (codeMatch) {
        const code = codeMatch[1];
        log(`Found Hinge verification code: ${code}`);
        return code;
      }

      // Pattern alternatif pour "Your code is: XXXXXX" ou similaire
      const altMatch = emailContent.match(/code\s*(?:is)?:?\s*(\d{6})/i);
      if (altMatch) {
        const code = altMatch[1];
        log(`Found Hinge verification code (alt pattern): ${code}`);
        return code;
      }

      // Pattern pour "verification code XXXXXX"
      const verifyMatch = emailContent.match(/verification\s+code[:\s]+(\d{6})/i);
      if (verifyMatch) {
        const code = verifyMatch[1];
        log(`Found Hinge verification code (verify pattern): ${code}`);
        return code;
      }
    }

    throw new Error('No verification code found in Quix email');
  }

  /**
   * Nettoie l'email temporaire (optionnel avec Quix)
   */
  async cleanup() {
    // Quix gère automatiquement le nettoyage des emails temporaires
    log('Quix email session ended');
    this.currentEmail = null;
    this.activationId = null;
  }
}

module.exports = QuixEmailService;