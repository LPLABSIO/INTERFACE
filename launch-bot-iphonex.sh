#!/bin/bash

echo "🚀 Lancement du bot pour iPhone X"
echo "=================================="
echo ""

# Configuration
IPHONE_IP="192.168.1.57"
WDA_PORT="8100"
APPIUM_PORT="1265"
UDID="af5afd94d5a9256554e735003c2f72fd16ec22f8"

# 1. Vérifier que WDA est actif
echo "📱 Vérification de WDA..."
if curl -s "http://$IPHONE_IP:$WDA_PORT/status" | grep -q "ready"; then
    echo "✅ WDA est actif sur http://$IPHONE_IP:$WDA_PORT"
else
    echo "❌ WDA n'est pas accessible!"
    echo "Lancement de WDA..."
    cd /Users/lucaspellegrino/Downloads/WebDriverAgent-master
    xcodebuild -project WebDriverAgent.xcodeproj \
        -scheme WebDriverAgentRunner \
        -destination "id=$UDID" \
        -derivedDataPath /tmp/wda_xcode \
        test-without-building &
    WDA_PID=$!

    echo "Attente du démarrage de WDA (30 secondes max)..."
    for i in {1..30}; do
        if curl -s "http://$IPHONE_IP:$WDA_PORT/status" 2>/dev/null | grep -q "ready"; then
            echo "✅ WDA démarré!"
            break
        fi
        sleep 1
    done
fi

# 2. Arrêter les anciens processus
echo ""
echo "🧹 Nettoyage des anciens processus..."
pkill -f "appium" 2>/dev/null
pkill -f "node.*bot.js" 2>/dev/null
sleep 2

# 3. Lancer Appium
echo ""
echo "🚀 Démarrage d'Appium sur le port $APPIUM_PORT..."
appium -p $APPIUM_PORT --base-path /wd/hub --log-level error &
APPIUM_PID=$!

# Attendre qu'Appium soit prêt
echo "⏰ Attente du démarrage d'Appium..."
for i in {1..10}; do
    if curl -s "http://127.0.0.1:$APPIUM_PORT/wd/hub/status" 2>/dev/null | grep -q "ready"; then
        echo "✅ Appium est prêt!"
        break
    fi
    sleep 1
done

# 4. Lancer le bot avec les bonnes variables d'environnement
echo ""
echo "🤖 Lancement du bot..."
echo "Configuration:"
echo "  - WDA URL: http://$IPHONE_IP:$WDA_PORT"
echo "  - Appium: 127.0.0.1:$APPIUM_PORT"
echo "  - Device: iPhone X ($UDID)"
echo ""

cd /Users/lucaspellegrino/Downloads/HINGE/INTERFACE

# Exporter les variables d'environnement
export WDA_URL="http://$IPHONE_IP:$WDA_PORT"
export APPIUM_PORT="$APPIUM_PORT"
export APPIUM_HOST="127.0.0.1"
export APPIUM_BASEPATH="/wd/hub"

# Lancer le bot
node src/bot/bot.js iphonex hinge 1 marsproxies

# Nettoyage à la fin
echo ""
echo "🛑 Arrêt des services..."
kill $APPIUM_PID 2>/dev/null
kill $WDA_PID 2>/dev/null