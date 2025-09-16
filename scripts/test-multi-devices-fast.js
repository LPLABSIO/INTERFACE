#!/usr/bin/env node

/**
 * Script de test RAPIDE pour valider le support multi-appareils
 * Version optimisée qui ne fait pas de scan réseau
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const { promisify } = require('util');
const execPromise = promisify(exec);

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

async function getDeviceInfo(udid) {
  try {
    const [deviceName, productType, productVersion] = await Promise.all([
      execPromise(`ideviceinfo -u ${udid} -k DeviceName 2>/dev/null || echo "iPhone"`),
      execPromise(`ideviceinfo -u ${udid} -k ProductType 2>/dev/null || echo "iPhone"`),
      execPromise(`ideviceinfo -u ${udid} -k ProductVersion 2>/dev/null || echo "Unknown"`)
    ]);

    const modelMap = {
      'iPhone10,3': 'iPhone X',
      'iPhone10,6': 'iPhone X',
      'iPhone11,2': 'iPhone XS',
      'iPhone11,8': 'iPhone XR',
      'iPhone12,1': 'iPhone 11',
      'iPhone12,3': 'iPhone 11 Pro',
      'iPhone12,5': 'iPhone 11 Pro Max',
      'iPhone13,1': 'iPhone 12 mini',
      'iPhone13,2': 'iPhone 12',
      'iPhone13,3': 'iPhone 12 Pro',
      'iPhone13,4': 'iPhone 12 Pro Max',
      'iPhone14,2': 'iPhone 13 Pro',
      'iPhone14,3': 'iPhone 13 Pro Max',
      'iPhone14,5': 'iPhone 13',
      'iPhone14,7': 'iPhone 14',
      'iPhone14,8': 'iPhone 14 Plus',
      'iPhone15,2': 'iPhone 14 Pro',
      'iPhone15,3': 'iPhone 14 Pro Max'
    };

    const model = modelMap[productType.stdout.trim()] || productType.stdout.trim();

    return {
      udid: udid,
      name: deviceName.stdout.trim(),
      model: model,
      version: productVersion.stdout.trim()
    };
  } catch (error) {
    return {
      udid: udid,
      name: 'iPhone',
      model: 'Unknown',
      version: 'Unknown'
    };
  }
}

async function launchAppiumServer(port, udid, deviceLabel, color) {
  return new Promise((resolve) => {
    log(`${deviceLabel} Démarrage d'Appium sur le port ${port}...`, color);

    const appium = spawn('npx', ['appium',
      '--port', port.toString(),
      '--use-drivers', 'xcuitest',
      '--driver-xcuitest-webdriver-agent-port', (8100 + (port - 1265)).toString(),
      '--log-timestamp'
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let appiumReady = false;

    appium.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Appium REST http interface listener started')) {
        if (!appiumReady) {
          appiumReady = true;
          log(`${deviceLabel} ✅ Appium prêt sur le port ${port}`, colors.green);
          resolve(appium);
        }
      }
      // Afficher les logs Appium en temps réel
      if (output.includes('ERROR') || output.includes('error')) {
        console.log(`${colors.red}${deviceLabel} [Appium:${port}] ${output.trim()}${colors.reset}`);
      }
    });

    appium.stderr.on('data', (data) => {
      const output = data.toString();
      if (output.includes('address already in use')) {
        log(`${deviceLabel} Port ${port} déjà utilisé`, colors.yellow);
        resolve(null);
      }
    });

    // Timeout de sécurité
    setTimeout(() => {
      if (!appiumReady) {
        log(`${deviceLabel} ⏱️ Timeout Appium sur port ${port}`, colors.yellow);
        resolve(appium);
      }
    }, 10000);
  });
}

async function testDevice(device, index) {
  const color = deviceColors[index % deviceColors.length];
  const deviceLabel = `[${device.name}]`;
  const appiumPort = 1265 + index;
  const wdaPort = 8100 + index;

  log(`\n${deviceLabel} 📱 Test de ${device.model} (${device.udid})`, color);
  log(`${deviceLabel} Ports - Appium: ${appiumPort}, WDA: ${wdaPort}`, color);

  // Lancer Appium
  const appium = await launchAppiumServer(appiumPort, device.udid, deviceLabel, color);

  if (!appium) {
    log(`${deviceLabel} ❌ Impossible de démarrer Appium`, colors.red);
    return { device, success: false, error: 'Appium failed to start' };
  }

  // Attendre un peu pour que Appium soit prêt
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Créer une session de test simple
  log(`${deviceLabel} 🔧 Création d'une session de test...`, color);

  return new Promise((resolve) => {
    const testScript = `
      const wdio = require('webdriverio');

      async function test() {
        const opts = {
          hostname: '127.0.0.1',
          port: ${appiumPort},
          path: '/wd/hub',
          logLevel: 'error',
          capabilities: {
            platformName: 'iOS',
            'appium:automationName': 'XCUITest',
            'appium:udid': '${device.udid}',
            'appium:newCommandTimeout': 30,
            'appium:wdaLocalPort': ${wdaPort},
            'appium:noReset': true
          }
        };

        try {
          console.log('Tentative de connexion...');
          const driver = await wdio.remote(opts);
          console.log('✅ Session créée avec succès');

          // Test simple : obtenir la source de la page
          const source = await driver.getPageSource();
          console.log('✅ Communication avec l\\'appareil OK');

          await driver.deleteSession();
          console.log('✅ Session fermée proprement');
          process.exit(0);
        } catch (error) {
          console.error('❌ Erreur:', error.message);
          process.exit(1);
        }
      }

      test();
    `;

    const testProcess = spawn('node', ['-e', testScript], {
      env: { ...process.env, NO_COLOR: '1' }
    });

    let output = '';

    testProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`${color}${deviceLabel} ${data.toString().trim()}${colors.reset}`);
    });

    testProcess.stderr.on('data', (data) => {
      console.log(`${colors.red}${deviceLabel} ${data.toString().trim()}${colors.reset}`);
    });

    testProcess.on('exit', (code) => {
      if (appium && !appium.killed) {
        appium.kill();
      }

      if (code === 0) {
        log(`${deviceLabel} ✅ Test réussi !`, colors.green);
        resolve({ device, success: true, output });
      } else {
        log(`${deviceLabel} ❌ Test échoué`, colors.red);
        resolve({ device, success: false, output });
      }
    });

    // Timeout de sécurité
    setTimeout(() => {
      if (!testProcess.killed) {
        testProcess.kill();
        if (appium && !appium.killed) {
          appium.kill();
        }
        log(`${deviceLabel} ⏱️ Timeout du test`, colors.yellow);
        resolve({ device, success: false, error: 'timeout' });
      }
    }, 30000);
  });
}

async function main() {
  console.log('\n========================================');
  console.log('   TEST RAPIDE MULTI-APPAREILS iOS');
  console.log('========================================\n');

  try {
    // 1. Détecter les appareils
    log('📱 Détection des appareils connectés...', colors.cyan);
    const { stdout } = await execPromise('idevice_id -l');
    const udids = stdout.trim().split('\n').filter(Boolean);

    if (udids.length === 0) {
      log('❌ Aucun appareil iOS détecté', colors.red);
      process.exit(1);
    }

    log(`✅ ${udids.length} appareil(s) détecté(s)\n`, colors.green);

    // 2. Obtenir les infos de chaque appareil
    const devices = [];
    for (const udid of udids) {
      const info = await getDeviceInfo(udid);
      devices.push(info);
      log(`  📱 ${info.name} (${info.model}) - iOS ${info.version}`, colors.cyan);
    }

    // 3. Tester chaque appareil en parallèle
    log('\n🚀 Lancement des tests en parallèle...\n', colors.cyan);

    const testPromises = devices.map((device, index) => testDevice(device, index));
    const results = await Promise.all(testPromises);

    // 4. Afficher le résumé
    log('\n📊 RÉSUMÉ DES TESTS', colors.cyan);
    log('═══════════════════════════════════════', colors.cyan);

    let successCount = 0;
    results.forEach((result, i) => {
      const color = deviceColors[i % deviceColors.length];
      if (result.success) {
        successCount++;
        log(`${color}✅ ${result.device.name} (${result.device.model})${colors.reset} - TEST RÉUSSI`);
      } else {
        log(`${colors.red}❌ ${result.device.name} (${result.device.model})${colors.reset} - TEST ÉCHOUÉ`);
      }
    });

    log('═══════════════════════════════════════', colors.cyan);
    log(`\n📈 Score: ${successCount}/${results.length} appareils fonctionnels`,
        successCount === results.length ? colors.green : colors.yellow);

    if (successCount === results.length) {
      log('\n🎉 Tous les appareils fonctionnent parfaitement !', colors.green);
      log('Le système multi-appareils est opérationnel.', colors.green);
    } else if (successCount > 0) {
      log('\n⚠️ Certains appareils ont des problèmes', colors.yellow);
      log('Vérifiez WDA sur les appareils qui ont échoué.', colors.yellow);
    } else {
      log('\n❌ Aucun appareil ne fonctionne', colors.red);
      log('Installez WDA avec: ./install-wda-xcode.sh', colors.red);
    }

    process.exit(successCount === results.length ? 0 : 1);

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