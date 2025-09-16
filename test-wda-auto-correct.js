const wdio = require("webdriverio");
const { spawn } = require('child_process');

async function launchAppiumAndTest() {
    console.log("🚀 Test de lancement automatique de WDA - Configuration correcte");
    console.log("================================================================");
    console.log("");

    // 1. Lancer Appium
    console.log("📱 Démarrage d'Appium...");
    const appium = spawn('appium', [
        '-p', '1265',
        '--base-path', '/wd/hub',
        '--log-level', 'debug'
    ], {
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let appiumReady = false;
    appium.stdout.on('data', (data) => {
        const log = data.toString();
        if (log.includes('Appium REST http interface listener started')) {
            appiumReady = true;
        }
        // Afficher uniquement les logs importants
        if (log.includes('WebDriverAgent') || log.includes('xcodebuild') || log.includes('WDA')) {
            console.log(`[APPIUM] ${log.trim()}`);
        }
    });

    appium.stderr.on('data', (data) => {
        const log = data.toString();
        if (log.includes('error') || log.includes('Error')) {
            console.error(`[APPIUM ERROR] ${log.trim()}`);
        }
    });

    // Attendre qu'Appium soit prêt
    console.log("⏰ Attente du démarrage d'Appium...");
    let attempts = 0;
    while (!appiumReady && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
    }

    if (!appiumReady) {
        console.error("❌ Appium n'a pas démarré après 30 secondes");
        appium.kill();
        process.exit(1);
    }

    console.log("✅ Appium est prêt!");
    console.log("");

    // 2. Configuration EXACTE qui fonctionnait ce matin
    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        connectionRetryCount: 3,
        connectionRetryTimeout: 300000,  // 5 minutes
        logLevel: "info",
        capabilities: {
            "appium:platformName": "iOS",
            "appium:platformVersion": "16.7.11",
            "appium:deviceName": "iPhone X",
            "appium:automationName": "XCUITest",
            "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",

            // Configuration WDA - CLÉS POUR LE LANCEMENT AUTOMATIQUE
            "appium:wdaLocalPort": 8100,
            "appium:webDriverAgentPath": "/Users/lucaspellegrino/Downloads/WebDriverAgent-master",

            // Options critiques pour le lancement automatique
            "appium:usePrebuiltWDA": false,  // Forcer la compilation/lancement
            "appium:wdaLaunchTimeout": 300000,  // 5 minutes pour compiler et lancer
            "appium:wdaStartupRetries": 4,  // IMPORTANT: Réessayer plusieurs fois
            "appium:wdaStartupRetryInterval": 10000,  // 10 secondes entre les essais

            // Certificats
            "appium:xcodeOrgId": "JLS2F99MK6",
            "appium:xcodeSigningId": "Apple Development",

            // Options de build
            "appium:derivedDataPath": "/tmp/wda_derived",
            "appium:showXcodeLog": true,

            // NE PAS utiliser ces options qui peuvent bloquer
            // "appium:skipWDAInstall": false,  // Commenté
            // "appium:webDriverAgentUrl": "...",  // Commenté - laisse Appium gérer

            // Options de session
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600,

            // Optimisations
            "appium:shouldUseSingletonTestManager": true,
            "appium:waitForQuiescence": false,
            "appium:waitForIdleTimeout": 0
        }
    };

    try {
        console.log("🔧 Lancement automatique de WDA via Appium...");
        console.log("📲 NE TOUCHEZ PAS votre iPhone - Tout doit être automatique");
        console.log("⏰ Première compilation: peut prendre 2-5 minutes");
        console.log("");

        const startTime = Date.now();
        const driver = await wdio.remote(opts);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n✅ SESSION CRÉÉE AUTOMATIQUEMENT en ${elapsed} secondes!`);
        console.log(`Session ID: ${driver.sessionId}`);
        console.log("");

        // Tests de validation
        console.log("🧪 Validation de la connexion...");

        const rect = await driver.getWindowRect();
        console.log(`✅ Écran: ${rect.width}x${rect.height}`);

        const source = await driver.getPageSource();
        console.log(`✅ Source: ${source.length} caractères`);

        await driver.execute('mobile: pressButton', { name: 'home' });
        console.log("✅ Bouton Home pressé");

        console.log("\n🛑 Fermeture de la session...");
        await driver.deleteSession();

        console.log("\n🎉 SUCCÈS TOTAL!");
        console.log("✅ WDA s'est lancé AUTOMATIQUEMENT");
        console.log("✅ Aucune intervention manuelle nécessaire");
        console.log("✅ La configuration fonctionne!");

        // Tuer Appium proprement
        appium.kill();
        process.exit(0);

    } catch (error) {
        console.error("\n❌ Erreur:", error.message);

        if (error.message.includes("xcodebuild failed")) {
            console.log("\n💡 Problème de compilation Xcode détecté");
            console.log("Solutions:");
            console.log("1. Vérifiez que l'iPhone est déverrouillé");
            console.log("2. Dans Xcode, nettoyez le build: Product > Clean Build Folder");
            console.log("3. Supprimez: rm -rf /tmp/wda_derived");
            console.log("4. Relancez ce script");
        } else if (error.message.includes("socket hang up")) {
            console.log("\n💡 WDA n'arrive pas à se connecter");
            console.log("Solutions:");
            console.log("1. Vérifiez 'Enable UI Automation' dans Réglages > Développeur");
            console.log("2. Redémarrez l'iPhone");
            console.log("3. Réinstallez WDA depuis Xcode");
        }

        appium.kill();
        process.exit(1);
    }
}

// Lancer le test
console.log("Test de lancement automatique de WebDriverAgent");
console.log("================================================\n");

launchAppiumAndTest().catch(err => {
    console.error("Erreur fatale:", err);
    process.exit(1);
});