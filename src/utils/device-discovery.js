const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const axios = require('axios');

/**
 * Découvre automatiquement l'IP d'un iPhone via WDA
 * Essaie plusieurs méthodes pour trouver l'IP de l'appareil
 */
class DeviceDiscovery {
  constructor() {
    // Ports WDA possibles à scanner
    this.wdaPorts = [8100, 8101, 8102, 8103, 8200, 8201, 8202, 8203, 8204, 8205];

    // Cache des IPs découvertes par UDID
    this.deviceIpCache = new Map();

    // Mapping des ports WDA par UDID
    this.devicePortMap = new Map();
  }

  /**
   * Obtient l'IP d'un iPhone via son UDID
   * @param {string} udid - L'UDID de l'appareil
   * @returns {Promise<{ip: string, wdaPort: number, wdaUrl: string}>}
   */
  async getDeviceIP(udid) {
    console.log(`[DeviceDiscovery] Recherche de l'IP pour l'appareil ${udid}...`);

    // Vérifier le cache
    if (this.deviceIpCache.has(udid)) {
      const cached = this.deviceIpCache.get(udid);
      console.log(`[DeviceDiscovery] IP trouvée dans le cache: ${cached.ip}`);
      return cached;
    }

    let deviceInfo = null;

    // Méthode 1: Essayer via iproxy avec plusieurs ports
    deviceInfo = await this.tryIproxyMethod(udid);

    // Méthode 2: Si iproxy échoue, essayer de scanner le réseau local
    if (!deviceInfo) {
      deviceInfo = await this.tryNetworkScan(udid);
    }

    // Méthode 3: Utiliser l'info de l'appareil via instruments
    if (!deviceInfo) {
      deviceInfo = await this.tryInstrumentsMethod(udid);
    }

    if (deviceInfo) {
      // Mettre en cache
      this.deviceIpCache.set(udid, deviceInfo);
      console.log(`[DeviceDiscovery] IP découverte: ${deviceInfo.ip}:${deviceInfo.wdaPort}`);
      return deviceInfo;
    }

    throw new Error(`Impossible de découvrir l'IP pour l'appareil ${udid}`);
  }

  /**
   * Méthode 1: Utilise iproxy pour créer un tunnel et vérifier WDA
   */
  async tryIproxyMethod(udid) {
    console.log(`[DeviceDiscovery] Essai via iproxy...`);

    for (const port of this.wdaPorts) {
      try {
        // Tuer les anciens tunnels iproxy sur ce port
        await execPromise(`pkill -f "iproxy ${port}" 2>/dev/null || true`);

        // Créer un tunnel iproxy
        const iproxyCmd = `iproxy ${port} ${port} ${udid} &`;
        await execPromise(iproxyCmd);

        // Attendre un peu que le tunnel s'établisse
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Tester la connexion localhost
        try {
          const response = await axios.get(`http://127.0.0.1:${port}/status`, { timeout: 2000 });
          if (response.data && response.data.value && response.data.value.ios) {
            const ip = response.data.value.ios.ip;

            // Tuer le tunnel temporaire
            await execPromise(`pkill -f "iproxy ${port}" 2>/dev/null || true`);

            // Maintenant tester directement avec l'IP trouvée
            try {
              await axios.get(`http://${ip}:${port}/status`, { timeout: 2000 });
              return {
                ip: ip,
                wdaPort: port,
                wdaUrl: `http://${ip}:${port}`
              };
            } catch (directError) {
              console.log(`[DeviceDiscovery] WDA non accessible directement sur ${ip}:${port}`);
            }
          }
        } catch (error) {
          // Port non utilisé par WDA
        }

        // Nettoyer le tunnel
        await execPromise(`pkill -f "iproxy ${port}" 2>/dev/null || true`);
      } catch (error) {
        // Continuer avec le prochain port
      }
    }

    return null;
  }

  /**
   * Méthode 2: Scanner le réseau local pour trouver WDA
   */
  async tryNetworkScan(udid) {
    console.log(`[DeviceDiscovery] Scan du réseau local...`);

    try {
      // Obtenir l'info de l'appareil
      const { stdout: deviceInfo } = await execPromise(`ideviceinfo -u ${udid} -k WiFiAddress 2>/dev/null || echo ""`);

      if (!deviceInfo.trim()) {
        return null;
      }

      // Obtenir le subnet local
      const { stdout: ifconfig } = await execPromise('ifconfig | grep "inet " | grep -v 127.0.0.1');
      const matches = ifconfig.match(/inet (\d+\.\d+\.\d+)\.\d+/);

      if (!matches) return null;

      const subnet = matches[1];
      console.log(`[DeviceDiscovery] Scan du subnet ${subnet}.0/24...`);

      // Scanner les IPs communes pour les iPhones
      const ipsToCheck = [];
      for (let i = 2; i < 100; i++) {
        ipsToCheck.push(`${subnet}.${i}`);
      }

      // Tester en parallèle (par batch pour ne pas surcharger)
      const batchSize = 10;
      for (let i = 0; i < ipsToCheck.length; i += batchSize) {
        const batch = ipsToCheck.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(ip => this.checkWDAOnIP(ip, udid))
        );

        const found = results.find(r => r !== null);
        if (found) {
          return found;
        }
      }
    } catch (error) {
      console.log(`[DeviceDiscovery] Erreur lors du scan réseau: ${error.message}`);
    }

    return null;
  }

  /**
   * Vérifie si WDA est accessible sur une IP donnée
   */
  async checkWDAOnIP(ip, udid) {
    for (const port of this.wdaPorts) {
      try {
        const response = await axios.get(`http://${ip}:${port}/status`, { timeout: 500 });
        if (response.data && response.data.value && response.data.value.device) {
          // Vérifier que c'est le bon appareil via une session test
          console.log(`[DeviceDiscovery] WDA trouvé sur ${ip}:${port}, vérification...`);
          return {
            ip: ip,
            wdaPort: port,
            wdaUrl: `http://${ip}:${port}`
          };
        }
      } catch (error) {
        // Continuer
      }
    }
    return null;
  }

  /**
   * Méthode 3: Utiliser instruments pour obtenir l'IP
   */
  async tryInstrumentsMethod(udid) {
    console.log(`[DeviceDiscovery] Essai via instruments...`);

    try {
      // Utiliser ios-deploy ou libimobiledevice pour obtenir l'info
      const { stdout } = await execPromise(`ideviceinfo -u ${udid} 2>/dev/null | grep -A1 WiFi`);

      // Parser l'IP si trouvée
      const ipMatch = stdout.match(/(\d+\.\d+\.\d+\.\d+)/);
      if (ipMatch) {
        const ip = ipMatch[1];

        // Tester les ports WDA
        for (const port of this.wdaPorts) {
          try {
            await axios.get(`http://${ip}:${port}/status`, { timeout: 2000 });
            return {
              ip: ip,
              wdaPort: port,
              wdaUrl: `http://${ip}:${port}`
            };
          } catch (error) {
            // Continuer
          }
        }
      }
    } catch (error) {
      console.log(`[DeviceDiscovery] Instruments non disponible`);
    }

    return null;
  }

  /**
   * Assigne automatiquement un port WDA libre pour un appareil
   */
  async assignWDAPort(udid) {
    // Si déjà assigné, retourner le port existant
    if (this.devicePortMap.has(udid)) {
      return this.devicePortMap.get(udid);
    }

    // Trouver un port libre
    const usedPorts = Array.from(this.devicePortMap.values());
    const freePort = this.wdaPorts.find(port => !usedPorts.includes(port));

    if (!freePort) {
      throw new Error('Aucun port WDA disponible');
    }

    this.devicePortMap.set(udid, freePort);
    console.log(`[DeviceDiscovery] Port WDA ${freePort} assigné à ${udid}`);
    return freePort;
  }

  /**
   * Lance WDA sur un appareil et retourne son URL
   */
  async launchWDA(udid, teamId = 'JLS2F99MK6') {
    console.log(`[DeviceDiscovery] Lancement de WDA pour ${udid}...`);

    const wdaPort = await this.assignWDAPort(udid);

    try {
      // Compiler et lancer WDA
      const wdaPath = '/Users/lucaspellegrino/Downloads/WebDriverAgent-master';
      const cmd = `
        cd ${wdaPath} &&
        xcodebuild -project WebDriverAgent.xcodeproj \
          -scheme WebDriverAgentRunner \
          -destination "id=${udid}" \
          -derivedDataPath /tmp/wda_${udid} \
          DEVELOPMENT_TEAM="${teamId}" \
          CODE_SIGN_IDENTITY="Apple Development" \
          test-without-building
      `;

      // Lancer en arrière-plan
      exec(cmd);

      // Attendre que WDA soit prêt
      console.log(`[DeviceDiscovery] Attente du démarrage de WDA...`);
      for (let i = 0; i < 30; i++) {
        const deviceInfo = await this.getDeviceIP(udid);
        if (deviceInfo) {
          return deviceInfo;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`[DeviceDiscovery] Erreur lors du lancement de WDA: ${error.message}`);
    }

    throw new Error(`Impossible de lancer WDA pour ${udid}`);
  }

  /**
   * Nettoie les ressources pour un appareil
   */
  cleanup(udid) {
    this.deviceIpCache.delete(udid);
    this.devicePortMap.delete(udid);
  }
}

module.exports = new DeviceDiscovery();