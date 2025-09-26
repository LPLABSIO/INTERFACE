const wdio = require("webdriverio");
const axios = require("axios");
const { log } = require("../../SHARED/utils/utils");
const { configureShadowrocket } = require("../../SHARED/ios-apps/shadowrocket");
const { loadLocations, saveLocations } = require("../../SHARED/utils/locations");
const { generateProxyInfo } = require("../../SHARED/proxy-manager/proxy");
const { performCraneForApp } = require("../../SHARED/ios-apps/crane");
const { setupGhostForApp } = require("../../SHARED/ios-apps/ghost");
const { getSMSProvider } = require("../../SHARED/sms-providers/sms-provider");
// Will be imported dynamically based on app type
const { setupGeraniumApp } = require("../../SHARED/ios-apps/geranium");
const QueueAdapter = require("../../SHARED/queue/queue-adapter");
const path = require("path");

/**
 * Bot Hinge simplifié - Utilise les paramètres de connexion depuis l'environnement
 * L'interface gère maintenant Appium et WDA
 * Plus besoin d'arguments de ligne de commande !
 */

// Vérifier si on est lancé avec des arguments (ancien système)
if (process.argv.length > 2) {
  console.log("[MIGRATION] ⚠️ Les arguments ne sont plus nécessaires");
  console.log("[MIGRATION] Le bot utilise maintenant les variables d'environnement");
  console.log("[MIGRATION] Device et app sont configurés automatiquement");
}

/**
 * Configure et exécute Hinge avec tous les helper apps nécessaires
 */
async function setupAndRunHinge(client, proxyInfo, location, phone, smsProvider, appType = 'hinge') {
  // Pour Hinge Fast, toute la configuration est gérée dans le script lui-même
  if (appType === 'hinge-fast') {
    // Hinge Fast: configuration intégrée dans le script
    log("🚀 Using Hinge Fast mode - all configuration handled in script");
    const { runHingeApp } = require("../../BOTS/hinge-fast/index");
    await runHingeApp(client, location, phone, proxyInfo, smsProvider);
  } else {
    // Hinge normal: configuration complète
    // 1. Configurer Crane pour l'isolation des conteneurs
    await performCraneForApp(client, 'Hinge', location.city);

    // 2. Configurer Ghost pour le spoofing d'appareil
    await setupGhostForApp(client, 'Hinge', location.city);

    // 3. Configurer le proxy via Shadowrocket
    await configureShadowrocket(client, proxyInfo, location.city);

    // 4. Configurer la géolocalisation via Geranium
    const lat = location?.latitude || location?.lat;
    const lon = location?.longitude || location?.lon;
    await setupGeraniumApp(client, { lat, lon, city: location.city });

    // 5. Exécuter Hinge normal
    const { runHingeApp } = require("../../BOTS/hinge/index");
    await runHingeApp(client, location, phone, proxyInfo, smsProvider);
  }
}

/**
 * Traite une tâche depuis la queue
 */
async function processQueueTask(client, task) {
  const { config } = task;

  // Charger les locations
  const location_file = path.join(__dirname, '../../data/resources/locations/locations_usa_tinder_original.csv');
  let locations = await loadLocations(location_file);

  if (locations.length === 0) {
    throw new Error('No locations available');
  }

  // Boucle pour essayer différentes villes jusqu'à trouver un proxy valide
  let proxyInfo = null;
  let location = null;

  while (locations.length > 0 && !proxyInfo) {
    location = locations[0];
    log(`📍 Processing location: ${location.city}, ${location.state}`);

    // Essayer de générer un proxy pour cette ville
    proxyInfo = await generateProxyInfo(location, config.proxyProvider || 'marsproxies');

    if (!proxyInfo) {
      log(`⚠️ No valid proxy found for ${location.city}, moving to next city...`);
      // Sauvegarder cette ville comme traitée
      await saveLocations(location.city, location_file);
      // Recharger les locations pour avoir la liste mise à jour (sans la ville qu'on vient de sauvegarder)
      locations = await loadLocations(location_file);
    }
  }

  if (!proxyInfo || !location) {
    throw new Error('No valid proxy found in any available city');
  }

  log(`✅ Valid proxy found for ${location.city}!`);

  // Obtenir un numéro de téléphone
  const provider = config.smsProvider || 'api21k';
  const smsService = getSMSProvider(provider);
  log(`Getting phone number from ${provider}...`);

  let phone;
  if (provider === 'daisysms') {
    // DaisySMS nécessite area_code, carrier et service
    phone = await smsService.rentNumber(null, null, 'vz'); // 'vz' est le code pour Hinge
  } else if (provider === 'api21k') {
    // API21K n'a pas besoin de paramètres
    phone = await smsService.rentNumber();
  } else {
    // Fallback pour d'autres providers
    phone = await smsService.rentNumber();
  }

  if (!phone || !phone.number) {
    throw new Error('Failed to get phone number');
  }

  // Exécuter Hinge (normal ou fast selon config)
  const appType = config.app || 'hinge';
  await setupAndRunHinge(client, proxyInfo, location, phone, provider, appType);

  // Sauvegarder la location utilisée
  await saveLocations(location.city, location_file);
}

/**
 * Fonction principale
 */
async function main() {
  let client;
  let queueAdapter = null;

  // Mode queue si activé
  if (QueueAdapter.isQueueMode()) {
    log("🔄 Queue mode activated");
    queueAdapter = new QueueAdapter();
    await queueAdapter.initialize();
    log("✓ Queue initialized");
  }

  // Configuration de connexion depuis l'environnement
  const opts = {
    hostname: process.env.APPIUM_HOST || "127.0.0.1",
    port: parseInt(process.env.APPIUM_PORT || "4723"),
    path: process.env.APPIUM_BASEPATH || "/wd/hub",
    connectionRetryCount: 3,
    connectionRetryTimeout: 120000,
    logLevel: "silent",
    capabilities: {
      "platformName": "iOS",
      "appium:platformVersion": process.env.IOS_VERSION || "16.7.11",
      "appium:deviceName": process.env.DEVICE_NAME || "iPhone",
      "appium:automationName": "XCUITest",
      "appium:udid": process.env.APPIUM_UDID || "auto",
      "appium:wdaLocalPort": parseInt(process.env.WDA_PORT || "8100"),
      "appium:wdaLaunchTimeout": 120000,

      // Optimisations de performance
      "appium:waitForIdleTimeout": 0,
      "appium:shouldUseCompactResponses": true,
      "appium:skipLogCapture": true,
      "appium:maxTypingFrequency": 30,
      "appium:snapshotMaxDepth": 2,
      "appium:includeNonModalElements": false,
      "appium:shouldUseTestManagerForVisibilityDetection": true,
      "appium:waitForQuiescence": false,
      "appium:useJSONSource": true,
      "appium:commandTimeouts": "5000",
      "appium:wdaStartupRetries": 3,
      "appium:wdaStartupRetryInterval": 1000,
      "appium:noReset": true,
      "appium:fullReset": false,
      "appium:simpleIsVisibleCheck": true,
      "appium:reducedMotion": false,
      "appium:elementResponseAttributes": "name,visible,enabled",
      "appium:skipServerInstallation": true,
      "appium:clearSystemFiles": true,
      "appium:shouldUseSingletonTestManager": true,
      "appium:maxRequestTimeout": 1000,
      "appium:interKeyDelay": 100,
      "appium:eventloopIdleDelaySec": 0,
      "appium:newCommandTimeout": 600,
    }
  };

  try {
    log("Starting Hinge bot session...");
    log("🎯 App: Hinge (uniquement)");

    // Vérifier la connexion Appium
    const effectiveHost = opts.hostname;
    const effectivePort = opts.port;
    const effectivePath = opts.path;
    const targetUdid = opts.capabilities["appium:udid"];
    const wdaPort = opts.capabilities["appium:wdaLocalPort"];

    log(`Connecting to Appium at ${effectiveHost}:${effectivePort}${effectivePath}`);
    log(`Device: ${targetUdid}, WDA Port: ${wdaPort}`);

    try {
      await axios.get(`http://${effectiveHost}:${effectivePort}${effectivePath}/status`, { timeout: 5000 });
      log("Appium server is ready");
    } catch (pingErr) {
      log(`Warning: Appium status check failed: ${pingErr?.message || pingErr}`);
    }

    // Connexion WebDriver
    const sessionTimeoutMs = 120000;
    client = await Promise.race([
      wdio.remote(opts),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Session timeout after ${sessionTimeoutMs}ms`)), sessionTimeoutMs)
      )
    ]);
    log("✓ Connected to WebDriver successfully");

    // MODE QUEUE
    if (queueAdapter) {
      log("📦 Starting queue processing loop...");
      while (true) {
        log("🔍 Checking for next task in queue...");
        const task = await queueAdapter.getNextTask();
        if (!task) {
          log("✅ Queue empty, exiting");
          break;
        }

        log(`📋 Processing task #${task.id} (attempt ${task.attempts}/${task.maxAttempts})`);
        log(`   Config: ${JSON.stringify(task.config)}`);

        try {
          await processQueueTask(client, task);
          await queueAdapter.markCompleted({ success: true });
          log(`✅ Task #${task.id} completed successfully`);
        } catch (error) {
          log(`❌ Task #${task.id} failed: ${error.message}`);
          await queueAdapter.markFailed(error.message);
        }

        log("⏳ Waiting 2 seconds before next task...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      log("🏁 Queue processing completed");
      return;
    }

    // MODE NORMAL
    let locations = [];

    // Priorité 1: Location depuis l'environnement
    if (process.env.HINGE_LOCATION) {
      try {
        const envLocation = JSON.parse(process.env.HINGE_LOCATION);
        log(`📍 Using location from environment: ${envLocation.city}, ${envLocation.state}`);
        locations = [envLocation];
      } catch (e) {
        log('Error parsing HINGE_LOCATION, falling back to CSV');
      }
    }

    // Priorité 2: Charger depuis CSV
    if (locations.length === 0) {
      log('Loading locations from CSV...');
      const location_file = path.join(__dirname, '../../data/resources/locations/locations_usa_tinder_original.csv');
      locations = await loadLocations(location_file);
    }

    // Traiter chaque location
    for (const location of locations) {
      log(`⏳ Processing: ${location.city}, ${location.state}`);

      // Obtenir un proxy
      const proxyInfo = await generateProxyInfo(location, "marsproxies", "city");
      if (!proxyInfo) {
        log("❌ No valid proxy found, skipping location");
        continue;
      }

      // Obtenir un numéro de téléphone
      const provider = "api21k";
      const smsService = getSMSProvider(provider);
      log(`Getting phone number from ${provider}...`);

      let phone = {};
      try {
        phone = await smsService.rentNumber(
          location.area_code || null,
          "vz,att",
          "oi",
          {
            operator: proxyInfo?.ipInfo?.isp,
            country: proxyInfo?.ipInfo?.country_code || location?.CountryCode,
            city: location?.city
          }
        );
      } catch (error) {
        log(`Error getting phone: ${error.message}`);

        // Fallback vers daisysms si api21k est bloqué
        if (error.message?.includes('CLOUDFLARE_BLOCKED')) {
          log('Trying fallback to daisysms...');
          try {
            const fallback = getSMSProvider('daisysms');
            phone = await fallback.rentNumber(location.area_code, "vz,att", "oi");
          } catch (fallbackErr) {
            log(`Fallback failed: ${fallbackErr.message}`);
            continue;
          }
        } else {
          continue;
        }
      }

      // Exécuter Hinge
      await setupAndRunHinge(client, proxyInfo, location, phone);

      // Sauvegarder la progression (sauf si location vient de l'env)
      if (!process.env.HINGE_LOCATION) {
        const location_file = path.join(__dirname, '../../data/resources/locations/locations_usa_tinder_original.csv');
        await saveLocations(location.city, location_file);
      } else {
        log('Environment location used, not updating CSV');
      }

      // Pause entre les locations
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

  } catch (error) {
    log(`Critical error: ${error.message}`, error);
    throw error;
  } finally {
    if (client) {
      try {
        log("Cleaning up session...");
        await client.deleteSession();
        log("✓ Session terminated");
      } catch (cleanupError) {
        log(`Cleanup error: ${cleanupError.message}`);
      }
    }
  }
}

// Lancement du bot
main().catch(error => {
  log(`Fatal error: ${error.message}`, error);
  process.exit(1);
});