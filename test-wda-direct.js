const wdio = require("webdriverio");

async function testWDA() {
    console.log("🚀 Test WDA avec configuration personnalisée...");

    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        connectionRetryCount: 3,
        connectionRetryTimeout: 120000,
        logLevel: "info",
        capabilities: {
            "appium:platformName": "iOS",
            "appium:platformVersion": "16.7.11",
            "appium:deviceName": "Ambre's iPhone",
            "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",
            "appium:automationName": "XCUITest",
            "appium:wdaLocalPort": 8100,
            // Configuration WDA personnalisée
            "appium:useNewWDA": true,  // Force nouvelle installation
            "appium:webDriverAgentUrl": "http://127.0.0.1:8100",
            "appium:derivedDataPath": "/tmp/wda_custom",
            "appium:usePrebuiltWDA": false,
            "appium:wdaLaunchTimeout": 180000, // 3 minutes
            "appium:xcodeOrgId": "JLS2F99MK6",
            "appium:xcodeSigningId": "Apple Development",
            "appium:showXcodeLog": true,
            "appium:updatedWDABundleId": "com.facebook.WebDriverAgentRunner.xctrunner",
            // Skip si déjà installé
            "appium:skipWDAInstall": false,
            "appium:noReset": true,
            "appium:fullReset": false
        }
    };

    try {
        console.log("📱 Connexion à l'appareil...");
        console.log("Configuration:", JSON.stringify(opts.capabilities, null, 2));

        const driver = await wdio.remote(opts);

        console.log("✅ Connexion réussie!");

        // Test simple
        const size = await driver.getWindowRect();
        console.log(`📐 Taille de l'écran: ${size.width}x${size.height}`);

        console.log("🛑 Fermeture de la session...");
        await driver.deleteSession();
        console.log("✅ Test terminé avec succès!");

    } catch (error) {
        console.error("❌ Erreur:", error.message);
        if (error.message.includes("socket hang up") || error.message.includes("ECONNREFUSED")) {
            console.log("\n💡 Solutions possibles:");
            console.log("1. Vérifiez que l'iPhone est déverrouillé");
            console.log("2. Allez dans Réglages > Développeur et activez 'Enable UI Automation'");
            console.log("3. Trust le certificat dans Réglages > Général > Gestion des appareils");
            console.log("4. Essayez de lancer WebDriverAgent manuellement depuis Xcode");
        }
    }
}

// Lancer le test
testWDA().catch(console.error);