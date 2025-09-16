const wdio = require("webdriverio");

async function testSimple() {
    console.log("🚀 Test simple de connexion WDA...");

    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        logLevel: "info",
        capabilities: {
            "appium:platformName": "iOS",
            "appium:platformVersion": "16.7.11",
            "appium:deviceName": "Ambre's iPhone",
            "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",
            "appium:automationName": "XCUITest",
            "appium:wdaLocalPort": 8100,
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600
        }
    };

    try {
        console.log("📱 Connexion à l'appareil...");
        const driver = await wdio.remote(opts);

        console.log("✅ Session créée avec succès!");

        // Test : obtenir la source de la page
        console.log("📋 Récupération de la source...");
        const source = await driver.getPageSource();
        console.log(`✅ Source récupérée (${source.length} caractères)`);

        // Test : prendre une capture d'écran
        console.log("📸 Prise de capture d'écran...");
        const screenshot = await driver.takeScreenshot();
        console.log("✅ Capture d'écran prise");

        // Test : vérifier si on peut lancer une app
        console.log("📱 Test de lancement d'app...");
        try {
            // Essayer de lancer l'app Hinge
            await driver.execute('mobile: launchApp', { bundleId: 'com.hinge.app' });
            console.log("✅ App Hinge lancée!");
        } catch (e) {
            console.log("⚠️ Hinge non installée ou erreur:", e.message);
        }

        console.log("⏰ Attente de 5 secondes...");
        await driver.pause(5000);

        console.log("🛑 Fermeture de la session...");
        await driver.deleteSession();
        console.log("✅ Test terminé avec succès!");

    } catch (error) {
        console.error("❌ Erreur:", error.message);
        console.error("Stack:", error.stack);
    }
}

// Lancer le test
testSimple().catch(console.error);