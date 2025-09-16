const { exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);
const deviceDiscovery = require('./device-discovery');

/**
 * Gestionnaire unifié pour tous les appareils iOS
 * Gère automatiquement la configuration pour n'importe quel iPhone connecté
 */
class DeviceManager {
  constructor() {
    // Ports Appium disponibles (un par appareil)
    this.appiumPorts = [1265, 1266, 1267, 1268, 1269, 1270];

    // Map des appareils actifs
    this.activeDevices = new Map();

    // Configuration par défaut
    this.defaultConfig = {
      teamId: 'JLS2F99MK6',
      wdaPath: '/Users/lucaspellegrino/Downloads/WebDriverAgent-master'
    };
  }

  /**
   * Détecte tous les iPhones connectés
   */
  async detectConnectedDevices() {
    console.log('[DeviceManager] Détection des appareils connectés...');

    try {
      // Utiliser idevice_id pour lister les appareils
      const { stdout } = await execPromise('idevice_id -l 2>/dev/null || true');
      const udids = stdout.trim().split('\n').filter(Boolean);

      if (udids.length === 0) {
        console.log('[DeviceManager] Aucun appareil iOS détecté');
        return [];
      }

      console.log(`[DeviceManager] ${udids.length} appareil(s) détecté(s)`);

      // Obtenir les infos pour chaque appareil
      const devices = [];
      for (const udid of udids) {
        try {
          const deviceInfo = await this.getDeviceInfo(udid);
          devices.push(deviceInfo);
        } catch (error) {
          console.error(`[DeviceManager] Erreur pour ${udid}: ${error.message}`);
        }
      }

      return devices;
    } catch (error) {
      console.error('[DeviceManager] Erreur lors de la détection:', error.message);
      return [];
    }
  }

  /**
   * Obtient les informations détaillées d'un appareil
   */
  async getDeviceInfo(udid) {
    try {
      // Obtenir le nom de l'appareil
      const { stdout: deviceName } = await execPromise(
        `ideviceinfo -u ${udid} -k DeviceName 2>/dev/null || echo "iPhone"`
      );

      // Obtenir le modèle
      const { stdout: productType } = await execPromise(
        `ideviceinfo -u ${udid} -k ProductType 2>/dev/null || echo "iPhone"`
      );

      // Obtenir la version iOS
      const { stdout: productVersion } = await execPromise(
        `ideviceinfo -u ${udid} -k ProductVersion 2>/dev/null || echo "Unknown"`
      );

      // Mapper le productType vers un nom convivial
      const modelMap = {
        'iPhone10,3': 'iPhone X',
        'iPhone10,6': 'iPhone X',
        'iPhone11,2': 'iPhone XS',
        'iPhone11,4': 'iPhone XS Max',
        'iPhone11,6': 'iPhone XS Max',
        'iPhone11,8': 'iPhone XR',
        'iPhone12,1': 'iPhone 11',
        'iPhone12,3': 'iPhone 11 Pro',
        'iPhone12,5': 'iPhone 11 Pro Max',
        'iPhone12,8': 'iPhone SE (2nd gen)',
        'iPhone13,1': 'iPhone 12 mini',
        'iPhone13,2': 'iPhone 12',
        'iPhone13,3': 'iPhone 12 Pro',
        'iPhone13,4': 'iPhone 12 Pro Max',
        'iPhone14,2': 'iPhone 13 Pro',
        'iPhone14,3': 'iPhone 13 Pro Max',
        'iPhone14,4': 'iPhone 13 mini',
        'iPhone14,5': 'iPhone 13',
        'iPhone14,6': 'iPhone SE (3rd gen)',
        'iPhone14,7': 'iPhone 14',
        'iPhone14,8': 'iPhone 14 Plus',
        'iPhone15,2': 'iPhone 14 Pro',
        'iPhone15,3': 'iPhone 14 Pro Max',
        'iPhone15,4': 'iPhone 15',
        'iPhone15,5': 'iPhone 15 Plus',
        'iPhone16,1': 'iPhone 15 Pro',
        'iPhone16,2': 'iPhone 15 Pro Max'
      };

      const model = modelMap[productType.trim()] || productType.trim();

      return {
        udid: udid,
        name: deviceName.trim(),
        model: model,
        version: productVersion.trim(),
        productType: productType.trim(),
        status: 'disconnected'
      };
    } catch (error) {
      console.error(`[DeviceManager] Erreur lors de la récupération des infos pour ${udid}:`, error.message);
      return {
        udid: udid,
        name: 'iPhone',
        model: 'Unknown',
        version: 'Unknown',
        status: 'error'
      };
    }
  }

  /**
   * Configure automatiquement un appareil pour l'automation
   */
  async setupDevice(udid) {
    console.log(`[DeviceManager] Configuration de l'appareil ${udid}...`);

    // Si déjà configuré, retourner la config existante
    if (this.activeDevices.has(udid)) {
      return this.activeDevices.get(udid);
    }

    try {
      // 1. Obtenir les infos de l'appareil
      const deviceInfo = await this.getDeviceInfo(udid);

      // 2. Assigner un port Appium libre
      const usedPorts = Array.from(this.activeDevices.values()).map(d => d.appiumPort);
      const appiumPort = this.appiumPorts.find(port => !usedPorts.includes(port));

      if (!appiumPort) {
        throw new Error('Aucun port Appium disponible');
      }

      // 3. Essayer de découvrir WDA existant
      let wdaInfo = null;
      try {
        wdaInfo = await deviceDiscovery.getDeviceIP(udid);
        console.log(`[DeviceManager] WDA existant trouvé: ${wdaInfo.wdaUrl}`);
      } catch (error) {
        console.log(`[DeviceManager] WDA non trouvé, sera lancé automatiquement`);
      }

      // 4. Si pas de WDA, assigner un port et préparer le lancement
      if (!wdaInfo) {
        const wdaPort = await deviceDiscovery.assignWDAPort(udid);
        wdaInfo = {
          wdaPort: wdaPort,
          needsLaunch: true
        };
      }

      // 5. Créer la configuration complète
      const config = {
        ...deviceInfo,
        appiumPort: appiumPort,
        wdaPort: wdaInfo.wdaPort,
        wdaUrl: wdaInfo.wdaUrl,
        wdaIP: wdaInfo.ip,
        needsWDALaunch: wdaInfo.needsLaunch || false,
        status: 'ready',
        // Configuration technique pour le bot
        opts: {
          hostname: '127.0.0.1',
          port: appiumPort,
          path: '/wd/hub',
          capabilities: {
            'platformName': 'iOS',
            'appium:platformVersion': deviceInfo.version,
            'appium:deviceName': deviceInfo.model,
            'appium:automationName': 'XCUITest',
            'appium:udid': udid,
            'appium:wdaLocalPort': wdaInfo.wdaPort,
            'appium:webDriverAgentUrl': wdaInfo.wdaUrl,
            'appium:usePrebuiltWDA': !wdaInfo.needsLaunch,
            'appium:skipWDAInstall': !wdaInfo.needsLaunch,
            // Optimisations
            'appium:noReset': true,
            'appium:fullReset': false,
            'appium:newCommandTimeout': 600,
            'appium:waitForQuiescence': false,
            'appium:waitForIdleTimeout': 0,
            'appium:shouldUseCompactResponses': true,
            'appium:skipLogCapture': true
          }
        }
      };

      // 6. Sauvegarder la configuration
      this.activeDevices.set(udid, config);

      console.log(`[DeviceManager] Configuration créée pour ${deviceInfo.name} (${deviceInfo.model})`);
      console.log(`  - Appium: port ${appiumPort}`);
      console.log(`  - WDA: ${wdaInfo.wdaUrl || 'sera lancé sur port ' + wdaInfo.wdaPort}`);

      return config;
    } catch (error) {
      console.error(`[DeviceManager] Erreur lors de la configuration de ${udid}:`, error.message);
      throw error;
    }
  }

  /**
   * Lance WDA pour un appareil si nécessaire
   */
  async launchWDAIfNeeded(udid) {
    const config = this.activeDevices.get(udid);
    if (!config || !config.needsWDALaunch) {
      return config;
    }

    console.log(`[DeviceManager] Lancement de WDA pour ${config.name}...`);

    try {
      const wdaInfo = await deviceDiscovery.launchWDA(udid, this.defaultConfig.teamId);

      // Mettre à jour la configuration
      config.wdaUrl = wdaInfo.wdaUrl;
      config.wdaIP = wdaInfo.ip;
      config.needsWDALaunch = false;
      config.opts.capabilities['appium:webDriverAgentUrl'] = wdaInfo.wdaUrl;
      config.opts.capabilities['appium:usePrebuiltWDA'] = true;
      config.opts.capabilities['appium:skipWDAInstall'] = true;

      console.log(`[DeviceManager] WDA lancé avec succès: ${wdaInfo.wdaUrl}`);

      return config;
    } catch (error) {
      console.error(`[DeviceManager] Erreur lors du lancement de WDA:`, error.message);
      throw error;
    }
  }

  /**
   * Obtient la configuration pour un appareil
   */
  getDeviceConfig(udid) {
    return this.activeDevices.get(udid);
  }

  /**
   * Nettoie les ressources pour un appareil
   */
  cleanupDevice(udid) {
    console.log(`[DeviceManager] Nettoyage pour ${udid}`);

    // Nettoyer dans deviceDiscovery
    deviceDiscovery.cleanup(udid);

    // Supprimer de la liste active
    this.activeDevices.delete(udid);
  }

  /**
   * Détecte et configure automatiquement tous les appareils connectés
   */
  async autoSetupAllDevices() {
    console.log('[DeviceManager] Configuration automatique de tous les appareils...');

    const devices = await this.detectConnectedDevices();
    const configured = [];

    for (const device of devices) {
      try {
        const config = await this.setupDevice(device.udid);
        configured.push(config);
      } catch (error) {
        console.error(`[DeviceManager] Impossible de configurer ${device.name}:`, error.message);
      }
    }

    console.log(`[DeviceManager] ${configured.length}/${devices.length} appareil(s) configuré(s)`);
    return configured;
  }
}

module.exports = new DeviceManager();