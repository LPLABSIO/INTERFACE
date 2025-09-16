const wdio = require("webdriverio");

async function testWithPrebuiltWDA() {
    console.log("🚀 Test avec WebDriverAgent pré-installé");
    console.log("=========================================");
    console.log("");
    console.log("📱 IMPORTANT: Lancez d'abord WebDriverAgent sur votre iPhone");
    console.log("⏰ Attente de 5 secondes pour le lancement manuel...");
    console.log("");

    await new Promise(resolve => setTimeout(resolve, 5000));

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

            // Configuration minimale pour WDA déjà lancé
            "appium:wdaLocalPort": 8100,
            "appium:webDriverAgentUrl": "http://127.0.0.1:8100",
            "appium:usePrebuiltWDA": true,
            "appium:skipWDAInstall": true,  // Ne pas réinstaller
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600
        }
    };

    try {
        console.log("📱 Connexion à WebDriverAgent déjà lancé...");

        const driver = await wdio.remote(opts);
        console.log(`✅ Session créée: ${driver.sessionId}`);

        // Test simple
        const rect = await driver.getWindowRect();
        console.log(`📐 Écran: ${rect.width}x${rect.height}`);

        console.log("\n🛑 Fermeture...");
        await driver.deleteSession();

        console.log("\n✅ SUCCÈS - La connexion fonctionne avec WDA pré-lancé");

        console.log("\n💡 Maintenant, testons le lancement automatique...");
        await testAutoLaunch();

    } catch (error) {
        console.error("\n❌ Erreur:", error.message);
    }
}

async function testAutoLaunch() {
    console.log("\n🔄 Test de lancement automatique de WDA");
    console.log("========================================");
    console.log("⚠️ NE TOUCHEZ PAS votre iPhone cette fois");
    console.log("");

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

            // Forcer le lancement automatique
            "appium:wdaLocalPort": 8100,
            "appium:usePrebuiltWDA": false,  // Forcer la reconstruction
            "appium:wdaLaunchTimeout": 300000,  // 5 minutes
            "appium:wdaStartupRetries": 2,
            "appium:wdaStartupRetryInterval": 20000,
            "appium:showXcodeLog": true,
            "appium:xcodeOrgId": "JLS2F99MK6",
            "appium:xcodeSigningId": "Apple Development",
            "appium:derivedDataPath": "/tmp/wda_build",
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600
        }
    };

    try {
        console.log("🏗️ Appium va compiler et lancer WDA automatiquement...");
        console.log("⏰ Cela peut prendre 2-5 minutes...");

        const startTime = Date.now();
        const driver = await wdio.remote(opts);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log(`\n✅ WDA lancé automatiquement en ${elapsed} secondes!`);
        console.log(`Session: ${driver.sessionId}`);

        await driver.deleteSession();
        console.log("\n🎉 SUCCÈS TOTAL - WDA peut se lancer automatiquement!");

    } catch (error) {
        console.error("\n❌ Le lancement automatique a échoué:", error.message);
        console.log("\n💡 Solutions:");
        console.log("1. Vérifiez les certificats dans Xcode");
        console.log("2. Supprimez WDA de l'iPhone et réessayez");
        console.log("3. Dans Xcode: Product > Clean Build Folder");
    }
}

// Lancer les tests
testWithPrebuiltWDA().catch(console.error);