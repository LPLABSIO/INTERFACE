const wdio = require("webdriverio");

async function testWDA() {
    console.log("🚀 Test WebDriverAgent sans app spécifique...");

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
            // Pas de bundleId - juste tester WDA
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 3600,
            "appium:wdaLocalPort": 8100
        }
    };

    try {
        console.log("📱 Connexion à l'appareil...");
        const driver = await wdio.remote(opts);

        console.log("✅ Connexion réussie!");
        console.log("🔍 Obtention des infos de l'appareil...");

        // Obtenir la taille de l'écran
        const size = await driver.getWindowRect();
        console.log(`📐 Taille de l'écran: ${size.width}x${size.height}`);

        // Prendre une capture d'écran
        const screenshot = await driver.takeScreenshot();
        console.log("📸 Capture d'écran prise avec succès");

        // Lister les apps
        console.log("📱 Recherche des éléments sur l'écran d'accueil...");
        const elements = await driver.$$('//XCUIElementTypeIcon');
        console.log(`📊 Nombre d'icônes trouvées: ${elements.length}`);

        console.log("⏰ Pause de 5 secondes...");
        await driver.pause(5000);

        console.log("🛑 Fermeture de la session...");
        await driver.deleteSession();
        console.log("✅ Test terminé avec succès!");

    } catch (error) {
        console.error("❌ Erreur lors du test:", error.message);
        console.error("Stack:", error.stack);
    }
}

// Lancer le test
testWDA().catch(console.error);