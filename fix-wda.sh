#!/bin/bash

echo "🔧 Configuration de WebDriverAgent pour iOS 16.7.11"

# Arrêter tous les processus
echo "Arrêt des processus..."
pkill -f xcodebuild || true
pkill -f appium || true
pkill -f iproxy || true

# Nettoyer les données dérivées
echo "Nettoyage des données temporaires..."
rm -rf /tmp/wda_derived
rm -rf ~/Library/Developer/Xcode/DerivedData/WebDriverAgent*

# Installer les dépendances WDA si nécessaire
echo "Vérification de WebDriverAgent..."
WDA_PATH="/Users/lucaspellegrino/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent"

if [ -d "$WDA_PATH" ]; then
    echo "✅ WebDriverAgent trouvé dans Appium"
    cd "$WDA_PATH"

    # Configurer le projet
    echo "Configuration du projet..."
    xcodebuild -project WebDriverAgent.xcodeproj \
        -scheme WebDriverAgentLib \
        -sdk iphoneos \
        CODE_SIGN_IDENTITY="Apple Development" \
        DEVELOPMENT_TEAM="JLS2F99MK6" \
        -derivedDataPath /tmp/wda_derived \
        build

    echo "✅ Configuration terminée"
else
    echo "❌ WebDriverAgent non trouvé. Installation requise."
    npm install -g appium-xcuitest-driver
fi

echo ""
echo "📱 Actions sur l'iPhone :"
echo "1. Allez dans Réglages > Développeur"
echo "2. Activez 'Enable UI Automation'"
echo "3. Allez dans Réglages > Général > VPN et gestion d'appareils"
echo "4. Faites confiance au certificat développeur"
echo ""
echo "✅ Script terminé"