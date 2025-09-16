const https = require('https');
const { log } = require('./utils');

const SCAMALYTICS_API_KEY = '1d0fbd9573e39fa6c5efc40161638a2eed8ef506d93f10e253303b332cac92d4';
const IP2LOCATION_API_KEY = '0BD9637C11523DE8D487BEF4F18A4E15';
const MAX_FRAUD_SCORE = 25;
const BASE_URL = 'https://api12.scamalytics.com/v3/adammgmtpro';

/**
 * Vérifie le score de fraude d'une IP via Scamalytics
 * @param {string} ipAddress - L'adresse IP à vérifier
 * @returns {Promise<{score: number, risk: string}>} - Le score de fraude et le niveau de risque
 */
async function checkFraudScore(ipAddress) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api12.scamalytics.com',
            port: 443,
            path: `/v3/adammgmtpro/?key=${SCAMALYTICS_API_KEY}&ip=${ipAddress}&test=0`,
            method: 'GET',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    log(`Réponse de l'API Scamalytics: ${data}`);
                    const result = JSON.parse(data);
                    
                    // Vérifier si l'API retourne un statut d'erreur
                    if (result.scamalytics && result.scamalytics.status !== 'ok') {
                        log(`❌ Erreur API Scamalytics: ${result.scamalytics.status}`);
                        reject(new Error(`API Error: ${result.scamalytics.status}`));
                        return;
                    }
                    
                    // Extraire le score depuis la structure correcte
                    const score = result.scamalytics ? result.scamalytics.scamalytics_score : 0;
                    const risk = result.scamalytics ? result.scamalytics.scamalytics_risk : 'low';
                    
                    log(`📊 Fraud Score pour ${ipAddress}: ${score} (${risk})`);
                    resolve({ score, risk });
                } catch (error) {
                    log(`❌ Erreur lors de l'analyse du fraud score: ${error.message}`);
                    reject(error);
                }
            });
        });

        req.on('error', (error) => {
            log(`❌ Erreur lors de la requête fraud score: ${error.message}`);
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout lors de la vérification du fraud score'));
        });

        req.end();
    });
}

/**
 * Récupère les informations détaillées d'une IP via ip2location.io
 * @param {string} ip - L'IP à analyser
 * @returns {Promise<Object>} - Informations détaillées de l'IP
 */
async function getDetailedIpInfo(ip) {
    try {
        log(`Récupération des informations détaillées pour l'IP: ${ip}`);
        
        const response = await axios.get(`https://api.ip2location.io/?key=${IP2LOCATION_API_KEY}&ip=${ip}`);
        const data = response.data;
        
        const results = {
            "IP": ip,
            "Pays": `${data.country_name} (${data.country_code})`,
            "Ville": data.city_name || 'Non disponible',
            "Région": data.region_name || 'Non disponible',
            "Coordonnées": `${data.latitude} / ${data.longitude}`,
            "Code Régional": data.area_code || 'Non disponible',
            "Codes de Secours": data.backup_area_codes ? data.backup_area_codes.replace(/\//g, ',') : 'Non disponible',
            "Type d'Utilisation": data.usage_type || 'Non disponible',
            "FAI": data.isp || 'Non disponible',
            "Domaine": data.domain || 'Non disponible',
            "Vitesse Réseau": data.net_speed || 'Non disponible'
        };
        
        log('Informations IP récupérées avec succès');
        return results;
    } catch (error) {
        log(`Erreur lors de la récupération des informations IP: ${error.message}`);
        throw error;
    }
}

/**
 * Vérifie si un proxy est associé à TMO ou ses sous-opérateurs
 * @param {Object} ipInfo - Informations de l'IP obtenue
 * @returns {boolean} - True si le proxy est associé à TMO
 */
function isTMOProxy(ipInfo) {
    if (!ipInfo || !ipInfo.isp) return false;
    
    const isp = ipInfo.isp.toLowerCase();
    const tmoOperators = [
        't-mobile', 'tmobile', 'sprint',
        'metro pcs', 'metropcs', 'boost mobile', 'virgin mobile',
        'simple mobile', 'mint mobile', 'ultra mobile', 'google fi',
        'project fi', 'republic wireless'
    ];
    
    return tmoOperators.some(op => isp.includes(op));
}

/**
 * Vérifie la qualité d'un proxy
 * @param {string} ip - L'IP du proxy
 * @returns {Promise<{isValid: boolean, details: Object}>} - Résultat de la vérification
 */
async function verifyProxyQuality(ip) {
    try {
        // Vérification du score de fraude
        const fraudCheck = await checkFraudScore(ip);
        log(`Score de fraude: ${fraudCheck.score} (${fraudCheck.risk})`);
        
        if (fraudCheck.score > MAX_FRAUD_SCORE) {
            log(`❌ Score de fraude trop élevé (${fraudCheck.score} > ${MAX_FRAUD_SCORE})`);
            return { isValid: false, details: fraudCheck };
        }

        // Récupération des informations détaillées
        const ipInfo = await getDetailedIpInfo(ip);
        
        // Vérification si le proxy est associé à T-Mobile
        if (isTMOProxy(ipInfo)) {
            log('❌ Proxy associé à T-Mobile ou ses sous-opérateurs');
            return { isValid: false, details: { ...ipInfo, ...fraudCheck } };
        }

        return { 
            isValid: true, 
            details: { 
                ...ipInfo, 
                ...fraudCheck,
                isTMO: isTMOProxy(ipInfo)
            } 
        };
    } catch (error) {
        log(`Erreur lors de la vérification de la qualité du proxy: ${error.message}`);
        throw error;
    }
}

module.exports = {
    checkFraudScore,
    getDetailedIpInfo,
    isTMOProxy,
    verifyProxyQuality,
    MAX_FRAUD_SCORE
}; 