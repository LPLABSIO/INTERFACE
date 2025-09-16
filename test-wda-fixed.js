const wdio = require("webdriverio");
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function setupWDAEnvironment() {
    console.log("🔧 Configuration de l'environnement WDA...");

    // 1. Tuer les anciens processus WDA
    try {
        await execPromise('pkill -f WebDriverAgent || true');
        console.log("✅ Anciens processus WDA fermés");
    } catch (e) {}

    // 2. Configurer le tunnel iproxy
    try {
        await execPromise('pkill -f "iproxy" || true');
        // Utiliser la syntaxe correcte pour iproxy avec le nouveau port
        const { spawn } = require('child_process');
        const iproxy = spawn('iproxy', ['8200', '8200'], {
            env: { ...process.env, UDID: 'af5afd94d5a9256554e735003c2f72fd16ec22f8' }
        });

        console.log("✅ Tunnel iproxy configuré");
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
        console.log("⚠️ Erreur tunnel:", e.message);
    }

    return true;
}

async function testWDAAutoLaunch() {
    console.log("🚀 Test de lancement automatique de WebDriverAgent");
    console.log("=================================================");
    console.log("");

    // Préparer l'environnement
    await setupWDAEnvironment();

    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        connectionRetryCount: 1,
        connectionRetryTimeout: 300000,  // 5 minutes
        logLevel: "info",
        capabilities: {
            "appium:platformName": "iOS",
            "appium:platformVersion": "16.7.11",
            "appium:deviceName": "Ambre's iPhone",
            "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",
            "appium:automationName": "XCUITest",

            // Configuration optimisée pour le lancement automatique
            "appium:wdaLocalPort": 8200,  // Port différent pour éviter les conflits

            // Utiliser le WDA existant dans WebDriverAgent-master
            "appium:webDriverAgentPath": "/Users/lucaspellegrino/Downloads/WebDriverAgent-master",

            // Options de lancement
            "appium:usePrebuiltWDA": false,  // Forcer la compilation
            "appium:useNewWDA": false,  // Ne pas recréer WDA à chaque fois
            "appium:wdaLaunchTimeout": 300000,  // 5 minutes
            "appium:wdaConnectionTimeout": 300000,
            "appium:wdaStartupRetries": 3,
            "appium:wdaStartupRetryInterval": 20000,

            // Certificats et signature
            "appium:xcodeOrgId": "JLS2F99MK6",
            "appium:xcodeSigningId": "iPhone Developer",  // Ou "Apple Development"
            "appium:updatedWDABundleId": "com.facebook.WebDriverAgentRunner",

            // Options de build
            "appium:derivedDataPath": "/tmp/wda_derived_data",
            "appium:showXcodeLog": true,
            "appium:shouldUseSingletonTestManager": true,

            // Options de session
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600,

            // Forcer le lancement même si WDA est déjà installé
            "appium:skipWDAInstall": false,
            "appium:autoLaunch": true,
            "appium:forceAppLaunch": true
        }
    };

    try {
        console.log("📱 Lancement automatique de WDA via Appium...");
        console.log("⏰ Cela peut prendre 2-5 minutes pour compiler et lancer WDA");
        console.log("📲 NE TOUCHEZ PAS votre iPhone");
        console.log("");

        const startTime = Date.now();
        const driver = await wdio.remote(opts);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n✅ SESSION CRÉÉE avec succès en ${elapsed} secondes!`);
        console.log(`Session ID: ${driver.sessionId}`);

        // Tests de validation
        console.log("\n🧪 Tests de validation...");

        // Test 1: Taille de l'écran
        const rect = await driver.getWindowRect();
        console.log(`✅ Écran détecté: ${rect.width}x${rect.height}`);

        // Test 2: Source de la page
        const source = await driver.getPageSource();
        console.log(`✅ Source récupérée: ${source.length} caractères`);

        // Test 3: Capture d'écran
        const screenshot = await driver.takeScreenshot();
        console.log(`✅ Capture d'écran réussie`);

        // Test 4: Lister les apps
        console.log("\n📱 Test de contrôle de l'appareil...");
        try {
            // Aller à l'écran d'accueil
            await driver.execute('mobile: pressButton', { name: 'home' });
            console.log("✅ Bouton Home pressé");
        } catch (e) {
            console.log("⚠️ Impossible de presser Home:", e.message);
        }

        console.log("\n🛑 Fermeture de la session...");
        await driver.deleteSession();

        console.log("\n🎉 SUCCÈS TOTAL!");
        console.log("✅ WebDriverAgent se lance automatiquement");
        console.log("✅ Aucune intervention manuelle nécessaire");
        console.log("✅ Le système est prêt pour l'automatisation");

        return true;

    } catch (error) {
        console.error("\n❌ Erreur:", error.message);

        if (error.message.includes("Failed to start WDA") ||
            error.message.includes("xcodebuild failed") ||
            error.message.includes("socket hang up")) {

            console.log("\n💡 Solutions à essayer:");
            console.log("");
            console.log("1. VÉRIFIER L'ÉTAT DE L'IPHONE:");
            console.log("   - L'iPhone doit être déverrouillé");
            console.log("   - 'Enable UI Automation' activé dans Réglages > Développeur");
            console.log("");
            console.log("2. RÉINSTALLER WDA:");
            console.log("   - Supprimez l'app WebDriverAgent de l'iPhone");
            console.log("   - Dans le terminal: rm -rf /tmp/wda_derived_data");
            console.log("   - Relancez ce script");
            console.log("");
            console.log("3. VÉRIFIER LES CERTIFICATS:");
            console.log("   - Ouvrez Xcode");
            console.log("   - Ouvrez /Users/lucaspellegrino/Downloads/WebDriverAgent-master/WebDriverAgent.xcodeproj");
            console.log("   - Sélectionnez WebDriverAgentRunner");
            console.log("   - Dans Signing & Capabilities, vérifiez que Team est bien 'JLS2F99MK6'");
            console.log("");
            console.log("4. SI TOUT ÉCHOUE - LANCEMENT SEMI-AUTOMATIQUE:");
            console.log("   - Dans Xcode, Product > Test (ou Cmd+U) avec l'iPhone sélectionné");
            console.log("   - Une fois WDA lancé via Xcode, relancez ce script");
        }

        return false;
    }
}

// Lancer le test
console.log("Test de lancement automatique de WebDriverAgent");
console.log("================================================\n");

testWDAAutoLaunch().then(success => {
    if (!success) {
        console.log("\n⚠️ Le lancement automatique a échoué");
        console.log("Suivez les instructions ci-dessus pour résoudre le problème");
    }
    process.exit(success ? 0 : 1);
}).catch(err => {
    console.error("Erreur fatale:", err);
    process.exit(1);
});