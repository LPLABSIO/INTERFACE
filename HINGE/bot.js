const wdio = require("webdriverio");
const axios = require("axios");
const { log } = require("./src/utils");
const { configureShadowrocket } = require("./src/shadowrocket");
const { runPofApp } = require("./src/pof");
const { loadLocations, saveLocations } = require("./src/locations");
const { generateProxyInfo } = require("./src/proxy");
const { performCraneSequence, performCraneForApp } = require("./src/crane");
const { setupGhostApp, setupGhostForApp } = require("./src/ghost");
const { setupOrbitApp, setupOrbitForApp } = require("./src/orbit");
const { runTinderJailedApp } = require("./src/tinderjailed");
const { runBlazeXApp, closeBlazeXApp } = require("./src/blazex");
const { runTinderApp } = require("./src/tinder");
const { getSMSProvider } = require("./src/sms-provider");
const { findAndClickWithPolling } = require("./src/utils");
const { runHingeApp } = require("./src/hinge");
const { setupGeraniumApp } = require("./src/geranium");

const path = require("path");

const iphone8_opts = {
  hostname: "127.0.0.1", // Explicitement défini pour Appium 2
  port: 4723,
  path: "/wd/hub", // Correction pour Appium 2 avec /wd/hub
  connectionRetryCount: 3, // Nombre de tentatives de reconnexion
  connectionRetryTimeout: 120000, // Timeout de reconnexion en ms
  logLevel: "silent", // Désactive les logs WebDriver
  capabilities: {
    "appium:platformName": "iOS", // Specifies the mobile platform being iOS
    "appium:platformVersion": "16.7.11", // Target iOS version to automate
    "appium:deviceName": "iPhone", // Model of device being automated
    "appium:automationName": "XCUITest", // iOS automation driver (XCUITest is required for iOS)
    "appium:udid": "93ab322f992f24643600b3604cf45f7115e820c1", // Unique device identifier for the connected iPhone
    "appium:wdaLocalPort": 8201, // Custom port for WebDriverAgent to avoid conflicts when running multiple sessions

    // Performance optimizations
    "appium:waitForIdleTimeout": 0, // Disables waiting for the app to be idle before performing actions
    "appium:shouldUseCompactResponses": true, // Reduces response size by excluding unnecessary data
    "appium:skipLogCapture": true, // Disables device log capturing to improve performance
    "appium:maxTypingFrequency": 30, // Sets maximum speed for text input (characters per minute)
    "appium:snapshotMaxDepth": 2, // Limits XML source tree depth to improve source retrieval performance
    "appium:includeNonModalElements": false, // Excludes non-modal elements from XML source to reduce size
    "appium:shouldUseTestManagerForVisibilityDetection": true, // Uses TestManager for faster element visibility checks
    "appium:waitForQuiescence": false, // Disables waiting for app quiescence (idle state) to speed up commands
    "appium:useJSONSource": true, // Uses JSON format for source retrieval which is faster than XML
    "appium:commandTimeouts": "5000", // Sets default timeout for commands to 5 seconds
    "appium:wdaStartupRetries": 0, // Disables retries when starting WebDriverAgent to fail fast
    "appium:wdaStartupRetryInterval": 1000, // Sets retry interval to 100ms if retries are needed
    "appium:noReset": true, // Prevents app data reset between sessions to maintain login state
    "appium:fullReset": false, // Disables full app reinstallation between sessions
    "appium:simpleIsVisibleCheck": true, // Uses simplified visibility checks for faster element detection
    "appium:reducedMotion": false, // Enables reduced motion on device to speed up animations
    "appium:elementResponseAttributes": "name,visible,enabled", // Limits element attributes in responses to essential ones
    "appium:skipServerInstallation": true, // Skips WebDriverAgent installation if already available

    // Advanced performance optimizations
    "appium:clearSystemFiles": true, // Cleans up temporary files generated during the session
    "appium:shouldUseSingletonTestManager": true, // Uses a singleton test manager to improve performance
    "appium:maxRequestTimeout": 1000, // Sets maximum timeout for API requests to 1 second
    "appium:interKeyDelay": 100, // Eliminates delay between keystrokes for faster typing
    "appium:eventloopIdleDelaySec": 0, // Minimizes event loop idle delay for faster command processing
    "appium:newCommandTimeout": 600, // Sets maximum timeout for new commands to 600 seconds
  },
};

const iphone12_opts = {
  hostname: "127.0.0.1",
  port: 4724,
  path: "/", // Correction pour Appium 2 sans /wd/hub
  connectionRetryCount: 3, // Nombre de tentatives de reconnexion
  connectionRetryTimeout: 120000, // Timeout de reconnexion en ms
  logLevel: "silent", // Désactive les logs WebDriver
  capabilities: {
    "appium:platformName": "iOS", // Specifies the mobile platform being iOS
    "appium:platformVersion": "18.2.1", // Target iOS version to automate
    "appium:deviceName": "iPhone", // Model of device being automated
    "appium:automationName": "XCUITest", // iOS automation driver (XCUITest is required for iOS)
    "appium:udid": "00008101-000504AC2660001E", // Unique device identifier for the connected iPhone
    "appium:wdaLocalPort": 8203, // Custom port for WebDriverAgent to avoid conflicts when running multiple sessions

    // Performance optimizations
    "appium:waitForIdleTimeout": 0, // Disables waiting for the app to be idle before performing actions
    "appium:shouldUseCompactResponses": true, // Reduces response size by excluding unnecessary data
    "appium:skipLogCapture": true, // Disables device log capturing to improve performance
    "appium:maxTypingFrequency": 30, // Sets maximum speed for text input (characters per minute)
    "appium:snapshotMaxDepth": 2, // Limits XML source tree depth to improve source retrieval performance
    "appium:includeNonModalElements": false, // Excludes non-modal elements from XML source to reduce size
    "appium:shouldUseTestManagerForVisibilityDetection": true, // Uses TestManager for faster element visibility checks
    "appium:waitForQuiescence": false, // Disables waiting for app quiescence (idle state) to speed up commands
    "appium:useJSONSource": true, // Uses JSON format for source retrieval which is faster than XML
    "appium:commandTimeouts": "5000", // Sets default timeout for commands to 5 seconds
    "appium:wdaStartupRetries": 0, // Disables retries when starting WebDriverAgent to fail fast
    "appium:wdaStartupRetryInterval": 1000, // Sets retry interval to 100ms if retries are needed
    "appium:noReset": true, // Prevents app data reset between sessions to maintain login state
    "appium:fullReset": false, // Disables full app reinstallation between sessions
    "appium:simpleIsVisibleCheck": true, // Uses simplified visibility checks for faster element detection
    "appium:reducedMotion": false, // Enables reduced motion on device to speed up animations
    "appium:elementResponseAttributes": "name,visible,enabled", // Limits element attributes in responses to essential ones
    "appium:skipServerInstallation": true, // Skips WebDriverAgent installation if already available

    // Advanced performance optimizations
    "appium:clearSystemFiles": true, // Cleans up temporary files generated during the session
    "appium:shouldUseSingletonTestManager": true, // Uses a singleton test manager to improve performance
    "appium:maxRequestTimeout": 1000, // Sets maximum timeout for API requests to 1 second
    "appium:interKeyDelay": 100, // Eliminates delay between keystrokes for faster typing
    "appium:eventloopIdleDelaySec": 0, // Minimizes event loop idle delay for faster command processing
    "appium:newCommandTimeout": 600, // Sets maximum timeout for new commands to 600 seconds
  },
};


const iphone14_opts = {
  hostname: "127.0.0.1",
  port: 4725,
  path: "/", // Correction pour Appium 2 sans /wd/hub
  connectionRetryCount: 3,
  connectionRetryTimeout: 120000,
  logLevel: "silent",
  capabilities: {
    "platformName": "iOS",
    "appium:platformVersion": "18.5",
    "appium:deviceName": "iPhone",
    "appium:automationName": "XCUITest",
    "appium:udid": "00008120-0018349636A0C01E",
    "appium:wdaLocalPort": 8100,
    "appium:wdaLaunchTimeout": 120000,
    "appium:showXcodeLog": true,
    "appium:webDriverAgentPath": "/Users/lucaspellegrino/Downloads/WebDriverAgent-master",
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

    // Advanced performance optimizations
    "appium:clearSystemFiles": true,
    "appium:shouldUseSingletonTestManager": true,
    "appium:maxRequestTimeout": 1000,
    "appium:interKeyDelay": 100,
    "appium:eventloopIdleDelaySec": 0,
    "appium:newCommandTimeout": 1200,
  },
};



const iphonex_opts = {
  hostname: "127.0.0.1",
  port: 1265,
  path: "/wd/hub", // Appium 2 sans /wd/hub
  connectionRetryCount: 3,
  connectionRetryTimeout: 120000,
  logLevel: "silent",
  capabilities: {
    "platformName": "iOS",
    "appium:platformVersion": "16.7.11",
    "appium:deviceName": "iPhone X",
    "appium:automationName": "XCUITest",
    "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",
    "appium:wdaLocalPort": 8205,
    "appium:wdaLaunchTimeout": 120000,
    "appium:showXcodeLog": true,
    "appium:webDriverAgentPath": "/Users/lucaspellegrino/Downloads/WebDriverAgent-master",
    "appium:xcodeOrgId": "JLS2F99MK6",
    "appium:xcodeSigningId": "Apple Development",
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

    // Advanced performance optimizations
    "appium:clearSystemFiles": true,
    "appium:shouldUseSingletonTestManager": true,
    "appium:maxRequestTimeout": 1000,
    "appium:interKeyDelay": 100,
    "appium:eventloopIdleDelaySec": 0,
    "appium:newCommandTimeout": 600,
  },
};


const country_gb = "gb";
const country_usa = "usa";

const country = country_usa;

// --- Argument parsing ---
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error(
    "Usage: node bot.js <iphone8|iphone12|iphone14|iphonex> <blazex|pof|tinderjailed|hinge>"
  );
  process.exit(1);
}

const [deviceArg, appArg] = args;

const deviceOptsMap = {
  iphone8: iphone8_opts,
  iphone12: iphone12_opts,
  iphone14: iphone14_opts,
  iphonex: iphonex_opts,
};

const appFunctionMap = {
  blazex: async (client, proxyInfo, location, phone) => {
    await configureShadowrocket(client, proxyInfo, location.city);
    await runBlazeXApp(client, location);
    await runTinderApp(client, phone, proxyInfo);
  },
  pof: async (client, proxyInfo, location) => {
    await performCraneSequence(client, location.city);
    await setupGhostApp(client, location.city);
    await setupOrbitApp(client, location);
    await configureShadowrocket(client, proxyInfo, location.city);
    await runPofApp(client, location);
  },
  tinderjailed: async (client, proxyInfo, location, phone) => {
    await configureShadowrocket(client, proxyInfo, location.city);
    await runTinderJailedApp(client, location);
    await runTinderApp(client, phone, proxyInfo);
  },
  hinge: async (client, proxyInfo, location, phone) => {
    await performCraneForApp(client, 'Hinge', location.city);
    await setupGhostForApp(client, 'Hinge', location.city);
    // Optionnel: Orbit si Hinge est listé dans Orbit
    // await setupOrbitForApp(client, 'Hinge', location);
    await configureShadowrocket(client, proxyInfo, location.city);
    // Geranium: définir la géolocalisation via LocSim/Map Pin
    const lat = location?.latitude || location?.lat;
    const lon = location?.longitude || location?.lon;
    await setupGeraniumApp(client, { lat, lon, city: location.city });
    await runHingeApp(client, location, phone, proxyInfo);
  },
};

const opts = deviceOptsMap[deviceArg];
// Override des paramètres de connexion Appium via variables d'environnement
if (opts) {
  if (process.env.APPIUM_HOST) {
    opts.hostname = process.env.APPIUM_HOST;
  }
  if (process.env.APPIUM_PORT) {
    const parsed = parseInt(process.env.APPIUM_PORT, 10);
    if (!Number.isNaN(parsed)) opts.port = parsed;
  }
  if (process.env.APPIUM_BASEPATH) {
    opts.path = process.env.APPIUM_BASEPATH;
  }
  // Override UDID et wdaLocalPort pour exécutions par appareil
  if (process.env.APPIUM_UDID) {
    opts.capabilities["appium:udid"] = process.env.APPIUM_UDID;
  }
  if (process.env.WDA_PORT) {
    const wdaPort = parseInt(process.env.WDA_PORT, 10);
    if (!Number.isNaN(wdaPort)) {
      opts.capabilities["appium:wdaLocalPort"] = wdaPort;
      // Laisser le driver gérer le tunnel vers 8100 automatiquement
    }
  }
}
const runApp = appFunctionMap[appArg];

if (!opts) {
  console.error(`Unknown device: ${deviceArg}. Use 'iphone8', 'iphone12', or 'new_device'.`);
  process.exit(1);
}
if (!runApp) {
  console.error(
    `Unknown app: ${appArg}. Use 'blazex', 'pof', 'tinderjailed', or 'hinge'.`
  );
  process.exit(1);
}

log(`Selected device: ${deviceArg}`);
log(`Selected app: ${appArg}`);

async function main() {
  let client;
  try {
    log("Starting bot session...");
    // Préflight: log et check /status Appium pour éviter les hangs silencieux
    const effectiveHost = opts.hostname || "127.0.0.1";
    const effectivePort = opts.port || 4723;
    const effectivePath = opts.path || "/wd/hub";
    const targetUdid = opts.capabilities?.["appium:udid"];
    const wdaPort = opts.capabilities?.["appium:wdaLocalPort"];
    log(`Connecting to Appium at ${effectiveHost}:${effectivePort}${effectivePath} (udid=${targetUdid || "n/a"}, wdaPort=${wdaPort || "n/a"})`);
    try {
      await axios.get(`http://${effectiveHost}:${effectivePort}${effectivePath}/status`, { timeout: 5000 });
      log("Appium /status OK");
    } catch (pingErr) {
      log(`Appium /status failed: ${pingErr?.message || pingErr}`);
    }
    const sessionTimeoutMs = 120000;
    client = await Promise.race([
      wdio.remote(opts),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`SessionTimeout after ${sessionTimeoutMs}ms`)), sessionTimeoutMs))
    ]);
    log("Successfully connected to WebDriver");
    const location_file =
      appArg === "pof"
        ? `locations_${country}_pof.csv`
        : `locations_${country}_tinder.csv`;

    // Load locations from CSV file
    if (appArg === "pof") {
      var locations = await loadLocations(path.join(__dirname, location_file));
    } else {
      var locations = await loadLocations(path.join(__dirname, location_file));
    }

    // Iterate through each location
    for (const location of locations) {
      log("⏳ Processing location: " + location.state + " - " + location.city);

      // Generate and test 5 proxies in parallel
      const proxyPromises = Array(1)
        .fill()
        .map(() => generateProxyInfo(location, "marsproxies", "city"));

      let proxyInfo = null;
      try {
        // Wait for the first valid proxy or until all fail
        const results = await Promise.all(proxyPromises);
        proxyInfo = results.find((proxy) => proxy !== null);
      } catch (error) {
        log(`Error testing proxies: ${error.message}`);
      }

      if (!proxyInfo) {
        log("❌ No valid proxy found for this location, skipping...");
        continue;
      }

      if (appArg === "pof") {
        await runApp(client, proxyInfo, location);
      } else if (appArg === "hinge") {
        const provider = "api21k";
        const smsService = getSMSProvider(provider);
        log(`Getting phone number from ${provider}...`);
        var phone = {};
        try {
          phone = await smsService.rentNumber(
            location.area_code ? location.area_code : null,
            "vz,att",
            "oi",
            {
              operator: proxyInfo?.ipInfo?.isp || undefined,
              country: proxyInfo?.ipInfo?.country_code || location?.CountryCode,
              city: location?.city
            }
          );
        } catch (error) {
          log(`Error getting phone number: ${error.message}`);
          if (error.message && error.message.includes('CLOUDFLARE_BLOCKED')) {
            log('api21k bloqué par Cloudflare, tentative avec daisysms...');
            try {
              const fallback = getSMSProvider('daisysms');
              phone = await fallback.rentNumber(
                location.area_code ? location.area_code : null,
                "vz,att",
                "oi"
              );
            } catch (fallbackErr) {
              log(`Fallback daisysms failed: ${fallbackErr.message}`);
              continue;
            }
          } else {
            continue;
          }
        }
        await runApp(client, proxyInfo, location, phone);
      } else {
        const provider = "daisysms";
        const smsService = getSMSProvider(provider);
        log(`Getting phone number from ${provider}...`);
        var phone = {};
        try {
          phone = await smsService.rentNumber(
            location.area_code ? location.area_code : null,
            "vz,att",
            "oi"
          );
        } catch (error) {
          log(`Error getting phone number: ${error.message}`);
          continue;
        }
        await runApp(client, proxyInfo, location, phone);
      }

      // Remove the processed location and reload the updated list
      locations = await saveLocations(
        location.city,
        path.join(__dirname, location_file)
      );

      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  } catch (error) {
    log(`Critical error in main execution: ${error.message}`, error);
    throw error;
  } finally {
    if (client) {
      try {
        log("Cleaning up main session...");
        await client.deleteSession();
        log("Main session terminated successfully");
      } catch (cleanupError) {
        log(
          `Error during session cleanup: ${cleanupError.message}`,
          cleanupError
        );
      }
    }
  }
}

// Improved error handling for the main execution
main().catch((error) => {
  log(`Fatal error in bot execution: ${error.message}`, error);
  process.exit(1);
});
