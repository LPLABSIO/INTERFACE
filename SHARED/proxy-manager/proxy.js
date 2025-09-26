const https = require("https");
const { SocksProxyAgent } = require("socks-proxy-agent");
const { log } = require("../utils/utils");
const { checkFraudScore, isTMOProxy, MAX_FRAUD_SCORE } = require('../utils/fraud_checker');

const API_KEY = '1bdb3bd53cfa9a0fc48b2a47cfcc4fad45c0aa260aacfa94cab24ea4';
const MAX_RETRIES = 1; // Réduit à 1 car on a déjà 3 tentatives de proxy différents
const RETRY_DELAY = 2000; // Réduit de 5s à 2s

/**
 * Récupère l'IP publique via un proxy
 * @param {Object} proxyConfig - Configuration du proxy
 * @returns {Promise<string>} - L'IP publique
 */
async function getIpViaProxy(proxyConfig) {
    let retries = 0;
    
    while (retries < MAX_RETRIES) {
        try {
            log(`\n=== Tentative de connexion ${retries + 1}/${MAX_RETRIES} ===`);
            
            if (!proxyConfig.username || !proxyConfig.password || !proxyConfig.domain || !proxyConfig.port) {
                log('❌ Configuration du proxy incomplète');
                return null;
            }

            const proxyUrl = `socks5://${proxyConfig.username}:${encodeURIComponent(proxyConfig.password)}@${proxyConfig.domain}:${proxyConfig.port}`;
            const agent = new SocksProxyAgent(proxyUrl);

            const options = {
                hostname: 'api.ipdata.co',
                port: 443,
                path: `/?api-key=${API_KEY}`,
                method: 'GET',
                agent: agent,
                timeout: 30000,
                headers: {
                    'Connection': 'keep-alive',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            };

            return new Promise((resolve) => {
                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => data += chunk);
                    res.on('end', async () => {
                        try {
                            const result = JSON.parse(data);
                            log(`✅ IP obtenue: ${result.ip}`);
                            resolve(result);
                        } catch (error) {
                            log(`❌ Erreur lors de l'analyse de la réponse: ${error.message}`);
                            resolve(null);
                        }
                    });
                });

                req.on('error', (error) => {
                    log(`❌ Erreur de requête: ${error.message}`);
                    if (retries < MAX_RETRIES - 1) {
                        setTimeout(() => {
                            retries++;
                            resolve(getIpViaProxy(proxyConfig));
                        }, RETRY_DELAY);
                    } else {
                        resolve(null);
                    }
                });

                req.on('timeout', () => {
                    log('❌ Timeout de la requête');
                    req.destroy();
                    if (retries < MAX_RETRIES - 1) {
                        setTimeout(() => {
                            retries++;
                            resolve(getIpViaProxy(proxyConfig));
                        }, RETRY_DELAY);
                    } else {
                        resolve(null);
                    }
                });

                req.end();
            });
        } catch (error) {
            log(`❌ Erreur lors de la configuration du proxy: ${error.message}`);
            if (retries < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                retries++;
                continue;
            }
            return null;
        }
    }
}

/**
 * Teste la connexion d'un proxy vers une destination
 * @param {Object} proxy - Configuration du proxy
 * @param {Object} destination - Configuration de la destination
 * @param {number} timeout - Timeout en millisecondes
 * @returns {Promise<boolean>} - Résultat du test
 */
async function testProxy(proxy, destination, timeout = 30000) {
    const maxRetries = 3;
    let retries = 0;
                const baseDelay = 2000; // Réduit de 5s à 2s
    const maxTimeout = 60000;

    while (retries < maxRetries) {
        try {
            log(`[testProxy] === Tentative de connexion SOCKS ${retries + 1}/${maxRetries} ===`);
            log(`[testProxy] Heure de début: ${new Date().toISOString()}`);
            
            if (!proxy || !proxy.domain || !proxy.port || !proxy.username || !proxy.password) {
                log('[testProxy] ❌ Configuration du proxy invalide ou incomplète');
                log(`[testProxy] Détails: domain=${proxy?.domain}, port=${proxy?.port}, username=${proxy?.username}, password=${proxy?.password ? 'défini' : 'non défini'}`);
                return false;
            }

            log(`[testProxy] Configuration de la connexion: socks5://${proxy.username}:***@${proxy.domain}:${proxy.port}`);
            log(`[testProxy] Destination: ${destination.host}:${destination.port}`);
            log(`[testProxy] Timeout: ${timeout}ms`);
            
            log('[testProxy] Tentative de connexion...');
            
            const { exec } = require('child_process');
            const command = `curl -4 --retry 3 -m ${timeout} -s -v -x socks5://${proxy.username}:${encodeURIComponent(proxy.password)}@${proxy.domain}:${proxy.port} https://${destination.host}`;
            log(`[testProxy] Commande exécutée: ${command}`);
            
            return new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        log(`[testProxy] ❌ Erreur lors de la connexion: ${error.message}`);
                        log(`[testProxy] Stderr: ${stderr}`);
                        reject(error);
                        return;
                    }
                    log('[testProxy] ✅ Connexion réussie');
                    log(`[testProxy] stdout: ${stdout}`);
                    resolve(stdout.trim());
                });
            });
        } catch (error) {
            retries++;
            log(`[testProxy] Exception JS: ${error.message}`);
            if (retries < maxRetries) {
                const delay = Math.min(baseDelay * Math.pow(2, retries - 1), maxTimeout);
                log(`[testProxy] ⏳ Attente de ${delay}ms avant la prochaine tentative...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Vérifie la qualité d'un proxy via ipdata.co
 * @param {Object} proxyConfig - Configuration du proxy
 * @returns {Promise<{isValid: boolean, ip: string, connectionSuccess: boolean}>} - Résultat de la vérification
 */
async function verifyProxy(proxyConfig) {
    if (!proxyConfig) {
        log('Configuration du proxy invalide : null');
        return { isValid: false, ip: null, connectionSuccess: false };
    }

    let retries = 0;
    
    while (retries < MAX_RETRIES) {
        try {
            if (!proxyConfig.username || !proxyConfig.password || !proxyConfig.domain || !proxyConfig.port) {
                log('Configuration du proxy incomplète :', JSON.stringify(proxyConfig));
                return { isValid: false, ip: null, connectionSuccess: false };
            }

            const proxyUrl = `socks5://${proxyConfig.username}:${encodeURIComponent(proxyConfig.password)}@${proxyConfig.domain}:${proxyConfig.port}`;
            const agent = new SocksProxyAgent(proxyUrl);

            const options = {
                hostname: 'api.ipdata.co',
                port: 443,
                path: `/?api-key=${API_KEY}`,
                method: 'GET',
                agent: agent,
                timeout: 30000,
                headers: {
                    'Connection': 'keep-alive',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            };

            return new Promise((resolve) => {
                const req = https.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => data += chunk);
                    res.on('end', async () => {
                        try {
                            const result = JSON.parse(data);
                            log(`✅ Proxy validé - IP obtenue: ${result.ip}`);
                            
                            // Vérification du fraud score
                            try {
                                const fraudCheck = await checkFraudScore(result.ip);
                                log(`📊 Fraud Score: ${fraudCheck.score} (${fraudCheck.risk})`);
                                
                                if (fraudCheck.score > MAX_FRAUD_SCORE) {
                                    log(`❌ Fraud score trop élevé (${fraudCheck.score} > ${MAX_FRAUD_SCORE})`);
                                    resolve({ isValid: false, ip: result.ip, connectionSuccess: true });
                                    return;
                                }
                            } catch (fraudError) {
                                log('Erreur lors de la vérification du fraud score:', fraudError);
                                // On continue même si la vérification du fraud score échoue
                            }

                            // Vérification si le proxy est associé à TMO
                            if (isTMOProxy(result)) {
                                log('❌ Proxy associé à TMO ou ses sous-opérateurs, rejeté');
                                resolve({ isValid: false, ip: result.ip, connectionSuccess: true });
                                return;
                            }
                            
                            resolve({ isValid: true, ip: result.ip, connectionSuccess: true });
                        } catch (e) {
                            log('Erreur lors de la vérification du proxy:', e);
                            resolve({ isValid: false, ip: null, connectionSuccess: false });
                        }
                    });
                });

                req.on('error', (error) => {
                    log(`Erreur de requête (tentative ${retries + 1}/${MAX_RETRIES}):`, error);
                    if (retries < MAX_RETRIES - 1) {
                        setTimeout(() => {
                            retries++;
                            resolve(verifyProxy(proxyConfig));
                        }, RETRY_DELAY);
                    } else {
                        resolve({ isValid: false, ip: null, connectionSuccess: false });
                    }
                });

                req.on('timeout', () => {
                    log(`Timeout lors de la vérification du proxy (tentative ${retries + 1}/${MAX_RETRIES})`);
                    req.destroy();
                    if (retries < MAX_RETRIES - 1) {
                        setTimeout(() => {
                            retries++;
                            resolve(verifyProxy(proxyConfig));
                        }, RETRY_DELAY);
                    } else {
                        resolve({ isValid: false, ip: null, connectionSuccess: false });
                    }
                });

                req.on('socket', (socket) => {
                    socket.on('error', (error) => {
                        log(`Erreur de socket (tentative ${retries + 1}/${MAX_RETRIES}):`, error);
                        if (retries < MAX_RETRIES - 1) {
                            setTimeout(() => {
                                retries++;
                                resolve(verifyProxy(proxyConfig));
                            }, RETRY_DELAY);
                        } else {
                            resolve({ isValid: false, ip: null, connectionSuccess: false });
                        }
                    });
                });

                req.end();
            });
        } catch (error) {
            log(`Erreur lors de la configuration du proxy (tentative ${retries + 1}/${MAX_RETRIES}):`, error);
            if (retries < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                retries++;
                continue;
            }
            return { isValid: false, ip: null, connectionSuccess: false };
        }
    }
}

/**
 * Génère une configuration de proxy pour une ville donnée
 * @param {Object} location - Informations sur la ville cible
 * @param {string} provider - Fournisseur de proxy à utiliser
 * @returns {Promise<Object>} - Configuration du proxy
 */
async function generateProxyInfo(location, provider = "marsproxies") {
    log(`[generateProxyInfo] Début génération proxy pour ${location.state} - ${location.city}`);
    
    const MAX_PROXY_ATTEMPTS = 3;
    let cityIsValid = false; // Flag pour savoir si la ville existe
    
    for (let attempt = 1; attempt <= MAX_PROXY_ATTEMPTS; attempt++) {
        log(`[generateProxyInfo] 🔄 Tentative ${attempt}/${MAX_PROXY_ATTEMPTS} pour ${location.city}`);
        
        // Formater le nom de la ville pour le proxy (enlever espaces et caractères spéciaux)
        const cityFormatted = location.city.toLowerCase()
            .replace(/\./g, '') // Enlever les points
            .replace(/\s+/g, '') // Enlever les espaces
            .replace(/[^a-z0-9]/g, ''); // Garder seulement lettres et chiffres

        // Générer un nouveau proxy avec un session ID unique pour chaque tentative
        const proxyConfig = {
            domain: "91.239.130.17",
            port: "44445",
            username: "mr91891Jq0I",
            password: `MgtGbjSfmP_country-${location.CountryCode}_city-${cityFormatted}_session-sid${Date.now()}_attempt-${attempt}_lifetime-168h_ultraset-1`
        };
        
        log(`[generateProxyInfo] Proxy généré (tentative ${attempt}): ${JSON.stringify(proxyConfig)}`);
        
        try {
            log(`[generateProxyInfo] Vérification du proxy (tentative ${attempt})...`);
            const verifyResult = await verifyProxy(proxyConfig);
            
            if (verifyResult.connectionSuccess) {
                // Si on arrive à se connecter, la ville est valide
                cityIsValid = true;
                log(`[generateProxyInfo] ✅ Ville ${location.city} confirmée comme valide (connexion réussie)`);
                
                if (verifyResult.isValid) {
                    log(`[generateProxyInfo] ✅ Proxy valide trouvé à la tentative ${attempt} pour ${location.city}!`);
                    return proxyConfig;
                } else {
                    log(`[generateProxyInfo] ❌ Proxy rejeté à la tentative ${attempt} (fraud score/TMO) mais ville valide`);
                    if (attempt < MAX_PROXY_ATTEMPTS) {
                        log(`[generateProxyInfo] ⏳ Attente de 3 secondes avant le prochain proxy...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            } else {
                // Échec de connexion
                log(`[generateProxyInfo] ❌ Échec de connexion à la tentative ${attempt}`);
                
                if (cityIsValid) {
                    // Si la ville était valide avant, on continue (problème temporaire)
                    log(`[generateProxyInfo] 🔄 Ville précédemment validée, on continue...`);
                    if (attempt < MAX_PROXY_ATTEMPTS) {
                        log(`[generateProxyInfo] ⏳ Attente de 3 secondes avant le prochain proxy...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } else {
                    // Premier échec, on attend un peu puis on réessaie
                    if (attempt < MAX_PROXY_ATTEMPTS) {
                        log(`[generateProxyInfo] ⏳ Attente de 3 secondes avant la prochaine tentative...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            }
        } catch (error) {
            log(`[generateProxyInfo] ❌ Exception lors de la tentative ${attempt}: ${error.message}`);
            if (attempt < MAX_PROXY_ATTEMPTS) {
                log(`[generateProxyInfo] ⏳ Attente de 3 secondes avant la prochaine tentative...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
    
    if (cityIsValid) {
        log(`[generateProxyInfo] ❌ Ville ${location.city} valide mais aucun proxy de qualité trouvé après ${MAX_PROXY_ATTEMPTS} tentatives`);
    } else {
        log(`[generateProxyInfo] ❌ Ville ${location.city} semble invalide (aucune connexion réussie après ${MAX_PROXY_ATTEMPTS} tentatives)`);
    }
    return null;
}

module.exports = {
    verifyProxy,
    generateProxyInfo,
    testProxy,
    getIpViaProxy
};
        