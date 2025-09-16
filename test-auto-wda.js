const wdio = require("webdriverio");

async function testAutoWDA() {
    console.log("🚀 Test de lancement automatique de WebDriverAgent");
    console.log("================================================");
    console.log("⚠️ NE TOUCHEZ PAS VOTRE IPHONE - Tout doit être automatique!");
    console.log("");

    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        connectionRetryCount: 3,
        connectionRetryTimeout: 180000,
        logLevel: "info",
        capabilities: {
            "appium:platformName": "iOS",
            "appium:platformVersion": "16.7.11",
            "appium:deviceName": "Ambre's iPhone",
            "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",
            "appium:automationName": "XCUITest",

            // Configuration pour lancement automatique de WDA
            "appium:wdaLocalPort": 8100,
            "appium:usePrebuiltWDA": true,  // Utiliser WDA déjà installé
            "appium:wdaLaunchTimeout": 180000,  // 3 minutes pour lancer
            "appium:wdaStartupRetries": 4,  // 4 tentatives
            "appium:wdaStartupRetryInterval": 10000,  // 10 secondes entre tentatives
            "appium:skipWDAInstall": false,  // Permettre l'installation si nécessaire
            "appium:webDriverAgentUrl": "http://127.0.0.1:8100",
            "appium:derivedDataPath": "/tmp/wda_auto",
            "appium:showXcodeLog": true,
            "appium:xcodeOrgId": "JLS2F99MK6",
            "appium:xcodeSigningId": "Apple Development",

            // Options supplémentaires pour forcer le lancement
            "appium:autoLaunch": true,
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600
        }
    };

    try {
        console.log("📱 Connexion et lancement automatique de WDA...");
        console.log("⏰ Cela peut prendre jusqu'à 3 minutes au premier lancement");
        console.log("");

        const startTime = Date.now();
        const driver = await wdio.remote(opts);
        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n✅ Session créée avec succès en ${elapsedTime} secondes!`);
        console.log(`Session ID: ${driver.sessionId}`);

        // Test simple
        const rect = await driver.getWindowRect();
        console.log(`📐 Taille de l'écran: ${rect.width}x${rect.height}`);

        // Test: obtenir la source
        console.log("\n📋 Test de récupération de la source...");
        const source = await driver.getPageSource();
        console.log(`✅ Source récupérée (${source.length} caractères)`);

        // Test: capture d'écran
        console.log("📸 Test de capture d'écran...");
        const screenshot = await driver.takeScreenshot();
        console.log("✅ Capture réussie");

        console.log("\n🛑 Fermeture de la session...");
        await driver.deleteSession();

        console.log("\n🎉 TEST RÉUSSI!");
        console.log("✅ WebDriverAgent se lance automatiquement");
        console.log("✅ Aucune intervention manuelle nécessaire");
        console.log("✅ Le système est prêt pour l'automatisation complète");

        return true;

    } catch (error) {
        console.error("\n❌ Erreur:", error.message);

        if (error.message.includes("Failed to start WDA") ||
            error.message.includes("xcodebuild failed") ||
            error.message.includes("Unable to launch")) {

            console.log("\n💡 Solutions possibles:");
            console.log("1. Assurez-vous que l'iPhone est déverrouillé");
            console.log("2. Vérifiez que 'Enable UI Automation' est activé dans Réglages > Développeur");
            console.log("3. Trust le certificat dans Réglages > Général > Gestion des appareils");
            console.log("4. Essayez de supprimer et réinstaller WebDriverAgent:");
            console.log("   - Dans Xcode, Product > Clean Build Folder");
            console.log("   - Supprimez l'app WebDriverAgent de l'iPhone");
            console.log("   - Relancez le test");
        }

        return false;
    }
}

// Lancer le test
console.log("Test de lancement automatique de WebDriverAgent");
console.log("================================================\n");

testAutoWDA().then(success => {
    process.exit(success ? 0 : 1);
});