#!/bin/bash

echo "🚀 Lancement automatique de WebDriverAgent"

UDID="af5afd94d5a9256554e735003c2f72fd16ec22f8"
WDA_BUNDLE_ID="com.facebook.WebDriverAgentRunner.xctrunner"

# Vérifier si WDA est déjà en cours d'exécution
echo "🔍 Vérification de l'état de WDA..."
if xcrun simctl list | grep -q "WebDriverAgent"; then
    echo "✅ WDA semble déjà actif"
else
    echo "📱 Lancement de WDA sur l'appareil..."

    # Méthode 1: Via ios-deploy (si installé)
    if command -v ios-deploy &> /dev/null; then
        echo "Utilisation d'ios-deploy..."
        ios-deploy --id $UDID --bundle_id $WDA_BUNDLE_ID --justlaunch --noinstall 2>/dev/null || true
    fi

    # Méthode 2: Via xcodebuild avec lancement automatique
    echo "🏗️ Compilation et lancement de WDA..."
    cd /Users/lucaspellegrino/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent 2>/dev/null || \
    cd /Users/lucaspellegrino/Downloads/WebDriverAgent-master

    xcodebuild \
        -project WebDriverAgent.xcodeproj \
        -scheme WebDriverAgentRunner \
        -destination "id=$UDID" \
        -derivedDataPath /tmp/wda_launch \
        CODE_SIGN_IDENTITY="Apple Development" \
        DEVELOPMENT_TEAM="JLS2F99MK6" \
        test &

    # Attendre que WDA démarre
    echo "⏰ Attente du démarrage de WDA (15 secondes)..."
    sleep 15

    # Vérifier si WDA est accessible
    echo "🔗 Test de connexion à WDA..."
    if curl -s http://127.0.0.1:8100/status > /dev/null 2>&1; then
        echo "✅ WDA est actif et accessible!"
    else
        echo "⚠️ WDA n'est pas encore accessible, configuration du tunnel..."
        # Configurer le tunnel iproxy
        pkill -f "iproxy 8100" || true
        iproxy 8100 8100 $UDID &
        sleep 2
    fi
fi

echo "✅ WDA est prêt!"