#!/usr/bin/env node

/**
 * Script de test pour valider le support multi-appareils
 * Lance automatiquement des sessions de test sur tous les appareils connectés
 */

const { spawn } = require('child_process');
const path = require('path');
const deviceManager = require('../src/utils/device-manager');

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Couleurs assignées à chaque appareil
const deviceColors = [colors.blue, colors.magenta, colors.cyan, colors.yellow, colors.green];

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function launchAppiumServer(port, udid) {
  return new Promise((resolve) => {
    log(`[Appium] Démarrage du serveur Appium sur le port ${port} pour ${udid}`, colors.yellow);

    const appium = spawn('appium', [
      '--port', port.toString(),
      '--use-drivers', 'xcuitest',
      '--driver-xcuitest-webdriver-agent-port', (8100 + (port - 1265)).toString()
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    appium.stdout.on('data', (data) => {
      if (data.toString().includes('Appium REST http interface listener started')) {
        log(`[Appium] Serveur prêt sur le port ${port}`, colors.green);
        resolve(appium);
      }
    });

    appium.stderr.on('data', (data) => {
      if (data.toString().includes('address already in use')) {
        log(`[Appium] Port ${port} déjà utilisé, serveur probablement déjà lancé`, colors.yellow);
        resolve(null);
      }
    });

    setTimeout(() => {
      resolve(appium);
    }, 5000);
  });
}

async function launchBot(device, index) {
  const color = deviceColors[index % deviceColors.length];
  const deviceLabel = `[${device.name}]`;

  log(`${deviceLabel} Lancement du bot sur ${device.model} (${device.udid})`, color);
  log(`${deviceLabel} Ports - Appium: ${device.appiumPort}, WDA: ${device.wdaPort}`, color);

  // Variables d'environnement pour le bot
  const env = {
    ...process.env,
    APPIUM_HOST: '127.0.0.1',
    APPIUM_PORT: device.appiumPort.toString(),
    APPIUM_UDID: device.udid,
    WDA_PORT: device.wdaPort.toString(),
    WDA_URL: device.wdaUrl || '',
    DEVICE_NAME: device.model,
    IOS_VERSION: device.version
  };

  // Lancer le bot
  const bot = spawn('node', [
    path.join(__dirname, '../src/bot/bot.js'),
    device.model.toLowerCase().replace(/\s/g, ''),
    'hinge' // App de test
  ], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Logger les sorties avec la couleur de l'appareil
  bot.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => {
      console.log(`${color}${deviceLabel} ${line}${colors.reset}`);
    });
  });

  bot.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    lines.forEach(line => {
      console.log(`${colors.red}${deviceLabel} ERROR: ${line}${colors.reset}`);
    });
  });

  bot.on('exit', (code) => {
    log(`${deviceLabel} Bot terminé avec le code ${code}`, code === 0 ? colors.green : colors.red);
  });

  return bot;
}

async function main() {
  console.log('\n========================================');
  console.log('   TEST MULTI-APPAREILS iOS');
  console.log('========================================\n');

  try {
    // 1. Détecter tous les appareils connectés
    log('📱 Détection des appareils connectés...', colors.cyan);
    const devices = await deviceManager.detectConnectedDevices();

    if (devices.length === 0) {
      log('❌ Aucun appareil iOS détecté. Connectez au moins un iPhone.', colors.red);
      log('\nPour connecter un appareil :', colors.yellow);
      log('1. Branchez votre iPhone via USB');
      log('2. Déverrouillez l\'appareil');
      log('3. Faites confiance à cet ordinateur si demandé');
      log('4. Relancez ce script\n');
      process.exit(1);
    }

    log(`✅ ${devices.length} appareil(s) détecté(s) :\n`, colors.green);

    // 2. Configurer chaque appareil
    const configuredDevices = [];
    for (let i = 0; i < devices.length; i++) {
      const device = devices[i];
      log(`📲 Configuration de ${device.name} (${device.model})...`, colors.blue);

      try {
        const config = await deviceManager.setupDevice(device.udid);
        configuredDevices.push(config);
        log(`✅ ${device.name} configuré avec succès`, colors.green);
      } catch (error) {
        log(`❌ Erreur pour ${device.name}: ${error.message}`, colors.red);
      }
    }

    if (configuredDevices.length === 0) {
      log('❌ Aucun appareil n\'a pu être configuré', colors.red);
      process.exit(1);
    }

    log(`\n🚀 Lancement des tests sur ${configuredDevices.length} appareil(s)...\n`, colors.cyan);

    // 3. Lancer Appium pour chaque appareil
    const appiumServers = [];
    for (const device of configuredDevices) {
      const appium = await launchAppiumServer(device.appiumPort, device.udid);
      if (appium) {
        appiumServers.push(appium);
      }
    }

    // Attendre un peu pour que les serveurs soient prêts
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. Lancer WDA si nécessaire
    for (const device of configuredDevices) {
      if (device.needsWDALaunch) {
        log(`🔧 Lancement de WDA pour ${device.name}...`, colors.yellow);
        try {
          await deviceManager.launchWDAIfNeeded(device.udid);
          log(`✅ WDA lancé pour ${device.name}`, colors.green);
        } catch (error) {
          log(`⚠️ WDA non lancé pour ${device.name}: ${error.message}`, colors.yellow);
        }
      }
    }

    // 5. Lancer les bots en parallèle
    log('\n🤖 Lancement des bots...\n', colors.cyan);
    const bots = [];
    for (let i = 0; i < configuredDevices.length; i++) {
      const bot = await launchBot(configuredDevices[i], i);
      bots.push(bot);

      // Petit délai entre les lancements
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    log('\n✅ Tous les bots sont lancés !', colors.green);
    log('\n📊 Résumé :', colors.cyan);
    configuredDevices.forEach((device, i) => {
      const color = deviceColors[i % deviceColors.length];
      log(`  ${color}● ${device.name} (${device.model})${colors.reset} - Appium:${device.appiumPort} WDA:${device.wdaPort}`);
    });

    log('\n⌨️  Appuyez sur Ctrl+C pour arrêter tous les bots\n', colors.yellow);

    // Gestion de l'arrêt propre
    process.on('SIGINT', () => {
      log('\n🛑 Arrêt des bots...', colors.yellow);

      // Tuer les bots
      bots.forEach(bot => {
        if (bot && !bot.killed) {
          bot.kill();
        }
      });

      // Tuer les serveurs Appium
      appiumServers.forEach(appium => {
        if (appium && !appium.killed) {
          appium.kill();
        }
      });

      // Nettoyer les appareils
      configuredDevices.forEach(device => {
        deviceManager.cleanupDevice(device.udid);
      });

      log('✅ Arrêt complet', colors.green);
      process.exit(0);
    });

    // Garder le processus en vie
    await new Promise(() => {});

  } catch (error) {
    log(`❌ Erreur fatale: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  }
}

// Lancer le script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };