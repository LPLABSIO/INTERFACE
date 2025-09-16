const https = require('https');
const { log } = require('./utils');

const API_KEY = '1bdb3bd53cfa9a0fc48b2a47cfcc4fad45c0aa260aacfa94cab24ea4';

/**
 * Récupère les informations détaillées d'une IP via ipdata.co
 * @param {string} ip - L'adresse IP à vérifier
 * @returns {Promise<Object>} - Les informations de l'IP
 */
async function getIpInfo(ip) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.ipdata.co',
            port: 443,
            path: `/?api-key=${API_KEY}`,
            method: 'GET',
            timeout: 30000,
            headers: {
                'Connection': 'keep-alive',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    log(`✅ Informations IP récupérées pour ${ip}`);
                    resolve(result);
                } catch (e) {
                    log(`❌ Erreur lors du parsing des données IP: ${e.message}`);
                    reject(e);
                }
            });
        });

        req.on('error', (error) => {
            log(`❌ Erreur lors de la requête IP: ${error.message}`);
            reject(error);
        });

        req.on('timeout', () => {
            log('❌ Timeout lors de la requête IP');
            req.destroy();
            reject(new Error('Timeout'));
        });

        req.end();
    });
}

/**
 * Vérifie si une IP est valide pour une localisation donnée
 * @param {string} ip - L'adresse IP à vérifier
 * @param {Object} location - La localisation attendue {city, state}
 * @returns {Promise<boolean>} - True si l'IP est valide
 */
async function verifyIpLocation(ip, location) {
    try {
        const ipInfo = await getIpInfo(ip);
        
        // Vérification de la ville
        const expectedCity = location.city?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const actualCity = ipInfo.city?.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (expectedCity && actualCity && !actualCity.includes(expectedCity) && !expectedCity.includes(actualCity)) {
            log(`❌ Ville différente (attendu: ${location.city}, trouvé: ${ipInfo.city})`);
            return false;
        }

        // Vérification de l'état
        const expectedState = location.state?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const actualState = ipInfo.region_name?.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        if (expectedState && actualState && !actualState.includes(expectedState) && !expectedState.includes(actualState)) {
            log(`❌ État différent (attendu: ${location.state}, trouvé: ${ipInfo.region_name})`);
            return false;
        }

        log('✅ Localisation IP validée');
        return true;
    } catch (error) {
        log(`❌ Erreur lors de la vérification de la localisation: ${error.message}`);
        return false;
    }
}

module.exports = {
    getIpInfo,
    verifyIpLocation
}; 