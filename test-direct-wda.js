const wdio = require("webdriverio");

async function testDirectWDA() {
    console.log("🧪 Test de connexion directe à WDA sur l'iPhone");
    console.log("================================================\n");

    // 1. Vérifier que WDA est accessible
    console.log("📱 Vérification de WDA sur http://192.168.1.57:8100...");
    try {
        const axios = require('axios');
        const response = await axios.get('http://192.168.1.57:8100/status');
        console.log("✅ WDA accessible!");
        console.log(`   Device: ${response.data.value.device}`);
        console.log(`   iOS: ${response.data.value.os.version}`);
        console.log(`   État: ${response.data.value.state}\n`);
    } catch (error) {
        console.error("❌ WDA non accessible:", error.message);
        process.exit(1);
    }

    // 2. Configuration pour se connecter au WDA existant
    const opts = {
        hostname: "127.0.0.1",
        port: 1265,
        path: "/wd/hub",
        capabilities: {
            "platformName": "iOS",
            "appium:platformVersion": "16.7.11",
            "appium:deviceName": "iPhone X",
            "appium:automationName": "XCUITest",
            "appium:udid": "af5afd94d5a9256554e735003c2f72fd16ec22f8",

            // CLÉS pour utiliser le WDA existant
            "appium:webDriverAgentUrl": "http://192.168.1.57:8100",
            "appium:usePrebuiltWDA": true,
            "appium:skipWDAInstall": true,

            // Options de session
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600
        }
    };

    // 3. Lancer Appium
    const { spawn } = require('child_process');
    console.log("🚀 Démarrage d'Appium...");
    const appium = spawn('appium', [
        '-p', '1265',
        '--base-path', '/wd/hub',
        '--log-level', 'error'
    ]);

    // Attendre qu'Appium démarre
    await new Promise(r => setTimeout(r, 3000));

    try {
        console.log("🔗 Connexion au WDA existant via Appium...\n");
        const driver = await wdio.remote(opts);

        console.log("✅ SESSION CRÉÉE!");
        console.log(`   Session ID: ${driver.sessionId}`);

        // Test basique
        const rect = await driver.getWindowRect();
        console.log(`   Écran: ${rect.width}x${rect.height}`);

        console.log("\n🎉 SUCCÈS - Connexion au WDA existant réussie!");
        console.log("✅ La configuration avec l'IP 192.168.1.57 fonctionne!\n");

        await driver.deleteSession();

    } catch (error) {
        console.error("\n❌ Erreur:", error.message);
        if (error.message.includes("socket hang up")) {
            console.log("\n💡 WDA n'est pas accessible ou a crashé");
            console.log("   Relancez WDA depuis Xcode ou avec install-wda-xcode.sh");
        }
    } finally {
        appium.kill();
        process.exit(0);
    }
}

testDirectWDA();