/**
 * Helper pour WebDriverAgent sur iOS
 *
 * IMPORTANT: Sur iOS 16.7+, WDA nécessite un lancement manuel initial
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class WDAHelper {
    constructor() {
        this.udid = "af5afd94d5a9256554e735003c2f72fd16ec22f8";
        this.wdaPort = 8100;
    }

    async checkWDAStatus() {
        try {
            const { stdout } = await execPromise('curl -s http://127.0.0.1:8100/status');
            if (stdout && stdout.includes('ready')) {
                return true;
            }
        } catch (e) {}
        return false;
    }

    async launchWDAViaXcode() {
        console.log("🚀 Lancement de WDA via Xcode...");
        console.log("   Cela va ouvrir Xcode et lancer WDA automatiquement");

        const script = `
            osascript -e 'tell application "Xcode"
                activate
                open "/Users/lucaspellegrino/Downloads/WebDriverAgent-master/WebDriverAgent.xcodeproj"
                delay 5
                tell application "System Events"
                    keystroke "u" using command down
                end tell
            end tell'
        `;

        try {
            await execPromise(script);
            console.log("✅ Commande Xcode envoyée");
            console.log("⏰ Attente de 30 secondes pour le lancement...");
            await new Promise(r => setTimeout(r, 30000));
            return true;
        } catch (e) {
            console.error("❌ Erreur Xcode:", e.message);
            return false;
        }
    }

    async waitForManualLaunch() {
        console.log("\n📱 ACTION REQUISE:");
        console.log("════════════════════════════════════════");
        console.log("1. Déverrouillez votre iPhone");
        console.log("2. Trouvez l'app 'WebDriverAgent'");
        console.log("3. Cliquez dessus pour la lancer");
        console.log("4. Un écran noir doit apparaître");
        console.log("════════════════════════════════════════\n");

        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max

        while (attempts < maxAttempts) {
            if (await this.checkWDAStatus()) {
                console.log("\n✅ WDA détecté et actif!");
                return true;
            }

            process.stdout.write(`\r⏰ Attente de WDA... ${60 - attempts} secondes restantes`);
            await new Promise(r => setTimeout(r, 5000));
            attempts += 5;
        }

        console.log("\n❌ Timeout - WDA non détecté");
        return false;
    }

    async setupPersistentWDA() {
        console.log("🔧 Configuration de WDA persistant...");

        // Créer un script de maintien
        const keepAliveScript = `
#!/bin/bash
while true; do
    curl -s http://127.0.0.1:8100/status > /dev/null 2>&1
    sleep 10
done
        `;

        try {
            await execPromise(`echo '${keepAliveScript}' > /tmp/wda-keepalive.sh`);
            await execPromise('chmod +x /tmp/wda-keepalive.sh');
            exec('/tmp/wda-keepalive.sh &');
            console.log("✅ Script de maintien WDA démarré");
        } catch (e) {
            console.error("⚠️ Impossible de créer le script de maintien");
        }
    }

    async getOptimalConfiguration() {
        // Configuration optimale pour iOS 16.7
        return {
            "appium:wdaLocalPort": this.wdaPort,
            "appium:webDriverAgentUrl": `http://127.0.0.1:${this.wdaPort}`,
            "appium:usePrebuiltWDA": true,  // Utiliser WDA déjà lancé
            "appium:skipWDAInstall": true,  // Ne pas réinstaller
            "appium:wdaLaunchTimeout": 120000,
            "appium:noReset": true,
            "appium:fullReset": false,
            "appium:newCommandTimeout": 600,
            "appium:shouldUseSingletonTestManager": true
        };
    }
}

// Usage
async function main() {
    const wda = new WDAHelper();

    console.log("🔍 Vérification de l'état de WDA...");

    if (await wda.checkWDAStatus()) {
        console.log("✅ WDA est déjà actif!");
        await wda.setupPersistentWDA();
        console.log("\n✅ Système prêt pour l'automatisation");
        console.log("Configuration recommandée:", await wda.getOptimalConfiguration());
        return;
    }

    console.log("❌ WDA n'est pas actif");
    console.log("\nOptions disponibles:");
    console.log("1. Lancement manuel (recommandé)");
    console.log("2. Lancement via Xcode (automatique mais plus lent)");

    // Pour cet exemple, on utilise le lancement manuel
    const success = await wda.waitForManualLaunch();

    if (success) {
        await wda.setupPersistentWDA();
        console.log("\n✅ Système prêt pour l'automatisation");
        console.log("Configuration recommandée:", await wda.getOptimalConfiguration());
    } else {
        console.log("\n❌ Impossible de démarrer WDA");
        console.log("Essayez de lancer via Xcode ou réinstallez WDA");
    }
}

// Si exécuté directement
if (require.main === module) {
    main().catch(console.error);
}

module.exports = WDAHelper;