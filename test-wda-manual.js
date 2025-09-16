const wdio = require("webdriverio");

async function connectWithDevice(device) {
    console.log(`\n📱 Test de connexion avec l'appareil: ${device.name}`);
    console.log(`UDID: ${device.udid}`);

    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        connectionRetryCount: 3,
        connectionRetryTimeout: 120000,
        logLevel: "info",
        capabilities: {
            "appium:platformName": "iOS",
            "appium:platformVersion": device.platformVersion || "16.7.11",
            "appium:deviceName": device.name,
            "appium:udid": device.udid,
            "appium:automationName": "XCUITest",
            "appium:wdaLocalPort": 8100,
            "appium:usePrebuiltWDA": false,
            "appium:wdaLaunchTimeout": 180000,
            "appium:webDriverAgentUrl": "http://127.0.0.1:8100",
            "appium:derivedDataPath": "/tmp/wda_custom",
            "appium:showXcodeLog": true,
            "appium:xcodeOrgId": "JLS2F99MK6",
            "appium:xcodeSigningId": "Apple Development",
            "appium:skipWDAInstall": true, // WDA déjà installé
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600
        }
    };

    try {
        console.log("\n⚠️  IMPORTANT: Lancez manuellement l'app WebDriverAgent sur votre iPhone");
        console.log("📲 Cliquez sur l'icône WebDriverAgent pour l'ouvrir");
        console.log("⏰ Attente de 5 secondes pour permettre le lancement manuel...\n");

        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log("🔌 Tentative de connexion...");
        const driver = await wdio.remote(opts);

        console.log("✅ Session créée avec succès!");
        console.log(`Session ID: ${driver.sessionId}`);

        // Test simple: obtenir les infos de l'écran
        const rect = await driver.getWindowRect();
        console.log(`📐 Taille de l'écran: ${rect.width}x${rect.height}`);

        // Test: lancer Hinge
        console.log("\n📱 Tentative de lancement de Hinge...");
        try {
            await driver.execute('mobile: launchApp', { bundleId: 'com.hinge.app' });
            console.log("✅ App Hinge lancée!");

            // Attendre un peu pour voir l'app
            console.log("⏰ Attente de 5 secondes...");
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Prendre une capture d'écran
            console.log("📸 Capture d'écran...");
            const screenshot = await driver.takeScreenshot();
            console.log("✅ Capture réussie");

            // Obtenir la source de la page
            console.log("📋 Récupération de la structure de l'interface...");
            const source = await driver.getPageSource();
            console.log(`✅ Source récupérée (${source.length} caractères)`);

            // Analyser rapidement si on voit des éléments Hinge
            if (source.includes("Hinge") || source.includes("com.hinge")) {
                console.log("✅ Éléments Hinge détectés dans l'interface!");
            }

        } catch (e) {
            console.log("⚠️ Erreur avec Hinge:", e.message);
            console.log("💡 Vérifiez que Hinge est installé sur l'appareil");
        }

        console.log("\n🛑 Fermeture de la session...");
        await driver.deleteSession();
        console.log("✅ Test terminé avec succès!");

        return true;

    } catch (error) {
        console.error("\n❌ Erreur:", error.message);

        if (error.message.includes("socket hang up") || error.message.includes("ECONNREFUSED")) {
            console.log("\n💡 Solutions:");
            console.log("1. Assurez-vous que l'app WebDriverAgent est lancée sur l'iPhone");
            console.log("2. L'écran de l'iPhone doit être déverrouillé");
            console.log("3. Vérifiez que 'Enable UI Automation' est activé dans Réglages > Développeur");
        }

        return false;
    }
}

// Dispositif configuré pour l'iPhone X
const device = {
    name: "Ambre's iPhone",
    udid: "af5afd94d5a9256554e735003c2f72fd16ec22f8",
    platformVersion: "16.7.11"
};

// Lancer le test
console.log("🚀 Démarrage du test avec lancement manuel de WDA");
connectWithDevice(device).then(success => {
    if (success) {
        console.log("\n🎉 Tous les tests ont réussi!");
        console.log("✅ WebDriverAgent fonctionne correctement");
        console.log("✅ La connexion avec l'appareil est établie");
        console.log("✅ Le bot peut maintenant contrôler l'iPhone");
    } else {
        console.log("\n⚠️ Le test a échoué, vérifiez les instructions ci-dessus");
    }
    process.exit(success ? 0 : 1);
});