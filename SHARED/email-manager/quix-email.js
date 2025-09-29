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
   * Génère un nouvel email temporaire via l'API Quix
   * Essaye Gmail en premier, puis outlook.com, puis hotmail.com en cas d'indisponibilité
   * @returns {Promise<string>} L'adresse email générée
   */
  async generateEmail() {
    const domains = ['gmail.com', 'outlook.com', 'hotmail.com'];
    let lastError = null;

    for (const domain of domains) {
      try {
        log(`Requesting new ${domain} address from Quix API...`);

        const response = await axios.get(`${this.baseURL}/${this.apiKey}/emailGet`, {
          params: {
            site: 'hinge.co',  // Le site depuis lequel l'email sera envoyé
            domain: domain
          }
        });

        if (response.data && response.data.success && response.data.result) {
          const result = response.data.result;
          this.currentEmail = result.email;
          this.activationId = result.id;

          // Log avec masquage partiel de l'email
          const [localPart, domainPart] = this.currentEmail.split('@');
          log(`Quix email generated: ${localPart.substring(0, 5)}***@${domainPart}`);
          log(`Activation ID: ${this.activationId}`);
          return this.currentEmail;
        }

        // Si la réponse indique que le domaine n'est pas disponible, essayer le suivant
        if (response.data?.error) {
          log(`${domain} not available: ${response.data.error}`);
          lastError = response.data.error;
          // Attendre 2-3 secondes avant d'essayer le domaine suivant
          if (domain !== domains[domains.length - 1]) {
            log(`Waiting before trying next domain...`);
            await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
          }
          continue;
        }

        throw new Error(response.data?.error || `Failed to generate email from ${domain}`);
      } catch (error) {
        log(`Error generating Quix email with ${domain}: ${error.message}`);
        lastError = error.message;

        // Si c'est le dernier domaine de la liste et qu'on a encore une erreur, on propage l'erreur
        if (domain === domains[domains.length - 1]) {
          throw new Error(`Failed to generate email from any domain. Last error: ${lastError}`);
        }
        // Sinon, attendre avant d'essayer le domaine suivant
        log(`Waiting 2-3 seconds before trying next domain...`);
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));
        continue;
      }
    }

    throw new Error(`Could not generate email from any available domain. Last error: ${lastError}`);
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

        if (response.data && response.data.result) {
          const result = response.data.result;
          // Log the response for debugging
          log(`Email status response: ${JSON.stringify(result)}`);

          // Si l'email est reçu (statut "completed")
          if (result.status === 'completed' && result.data) {
            log('Email received from Hinge');
            return result.data; // 'data' field contains the email content
          }

          // Log the current status
          if (result.status) {
            log(`Current email status: ${result.status}`);
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
  async getHingeCode(timeout = 240000) {
    log('Waiting for Hinge verification code from Quix...');

    if (!this.activationId) {
      throw new Error('No activation ID available. Generate an email first.');
    }

    const startTime = Date.now();

    // Poll for email status and code
    while (Date.now() - startTime < timeout) {
      try {
        // Check email status first
        const statusResponse = await axios.get(`${this.baseURL}/${this.apiKey}/emailStatus`, {
          params: {
            id: this.activationId
          }
        });

        // Access result field from API response
        const statusResult = statusResponse.data?.result;
        log(`Email status check - Status: ${statusResult?.status}, Has parsed: ${!!statusResult?.parsed}`);

        // Check if email is completed
        if (statusResult && statusResult.status === 'completed') {

          // First check if there's a parsed code
          if (statusResult.parsed) {
            // Extract 6-digit code from parsed field
            const parsedMatch = statusResult.parsed.match(/(\d{6})/);
            if (parsedMatch) {
              const code = parsedMatch[1];
              log(`Found Hinge code from parsed field: ${code}`);
              return code;
            }
            log(`Parsed field exists but no 6-digit code found: ${statusResult.parsed}`);
          }

          // Try the emailCode endpoint for direct code extraction
          try {
            const codeResponse = await axios.get(`${this.baseURL}/${this.apiKey}/emailCode`, {
              params: {
                id: this.activationId
              }
            });

            if (codeResponse.data?.result?.code) {
              // Extract 6-digit code from code field
              const codeMatch = codeResponse.data.result.code.match(/(\d{6})/);
              if (codeMatch) {
                const code = codeMatch[1];
                log(`Found Hinge code via emailCode endpoint: ${code}`);
                return code;
              }
            }
          } catch (codeError) {
            log(`emailCode endpoint error: ${codeError.message}`);
          }

          // Fallback to parsing email content
          if (statusResult.data) {
            const emailContent = statusResult.data;
            log('Email received, parsing content for code...');

            // Pattern pour trouver un code à 6 chiffres
            const patterns = [
              /\b(\d{6})\b/,                              // Simple 6-digit
              /code\s*(?:is)?:?\s*(\d{6})/i,             // "code is: XXXXXX"
              /verification\s+code[:\s]+(\d{6})/i,       // "verification code XXXXXX"
              /enter\s+(\d{6})/i,                         // "enter XXXXXX"
              /use\s+(\d{6})/i                            // "use XXXXXX"
            ];

            for (const pattern of patterns) {
              const match = emailContent.match(pattern);
              if (match) {
                const code = match[1];
                log(`Found Hinge verification code: ${code}`);
                return code;
              }
            }

            log('Email received but no code pattern matched');
          }
        } else if (statusResult?.status === 'cancelled') {
          log('Email status is cancelled, stopping wait');
          throw new Error('Email activation was cancelled');
        } else if (statusResult?.status === 'no_email') {
          log('Waiting for email to arrive...');
        } else if (!statusResult) {
          log('No result field in response, might be an API error');
        }
      } catch (error) {
        log(`Error fetching email status: ${error.message}`);
      }

      // Attendre 3 secondes avant de réessayer
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    log('Timeout waiting for Quix verification code');
    throw new Error('Timeout waiting for Hinge verification code');
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