const wdio = require("webdriverio");

async function testHinge() {
    console.log("🚀 Démarrage du test Hinge...");

    const opts = {
        hostname: "127.0.0.1",
        port: 1265, // Port Appium actuel
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
            "appium:bundleId": "com.hinge.app", // Bundle ID de Hinge
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
        console.log("🔍 Vérification de l'état de l'application Hinge...");

        // Attendre un peu pour que l'app se charge
        await driver.pause(3000);

        // Essayer de trouver un élément de l'interface Hinge
        try {
            // Chercher le bouton "Like" ou un élément similaire
            const elements = await driver.$$('//XCUIElementTypeButton');
            console.log(`📊 Nombre de boutons trouvés: ${elements.length}`);

            // Prendre une capture d'écran
            const screenshot = await driver.takeScreenshot();
            console.log("📸 Capture d'écran prise");

            // Obtenir la taille de l'écran
            const size = await driver.getWindowRect();
            console.log(`📐 Taille de l'écran: ${size.width}x${size.height}`);

        } catch (error) {
            console.log("⚠️ Impossible de trouver des éléments Hinge, l'app n'est peut-être pas ouverte");
        }

        console.log("⏰ Test en cours pendant 10 secondes...");
        await driver.pause(10000);

        console.log("🛑 Arrêt du test...");
        await driver.deleteSession();
        console.log("✅ Test terminé avec succès!");

    } catch (error) {
        console.error("❌ Erreur lors du test:", error.message);
        console.error("Stack:", error.stack);
    }
}

// Lancer le test
testHinge().catch(console.error);