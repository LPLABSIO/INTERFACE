#!/bin/bash

echo "🔧 Installation de WebDriverAgent via Xcode"
echo "==========================================="
echo ""

UDID="af5afd94d5a9256554e735003c2f72fd16ec22f8"
TEAM_ID="JLS2F99MK6"
WDA_PATH="/Users/lucaspellegrino/Downloads/WebDriverAgent-master"

cd "$WDA_PATH"

echo "📱 Compilation et installation de WDA sur l'iPhone..."
echo "⏰ Cela peut prendre 2-3 minutes..."
echo ""

# Compiler et installer WDA
xcodebuild \
    -project WebDriverAgent.xcodeproj \
    -scheme WebDriverAgentRunner \
    -destination "id=$UDID" \
    -derivedDataPath /tmp/wda_xcode \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_IDENTITY="Apple Development" \
    PRODUCT_BUNDLE_IDENTIFIER="com.lucaspellegrino.WebDriverAgentRunner" \
    CODE_SIGN_STYLE="Automatic" \
    build-for-testing

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ WDA compilé avec succès!"
    echo ""
    echo "📱 Installation sur l'iPhone..."

    # Lancer les tests pour installer et démarrer WDA
    xcodebuild \
        -project WebDriverAgent.xcodeproj \
        -scheme WebDriverAgentRunner \
        -destination "id=$UDID" \
        -derivedDataPath /tmp/wda_xcode \
        test-without-building &

    XCODE_PID=$!

    echo ""
    echo "⚠️  ACTION REQUISE SUR L'IPHONE:"
    echo "================================="
    echo ""
    echo "1. Si une popup 'Développeur non approuvé' apparaît:"
    echo "   - Allez dans Réglages > Général > VPN et gestion d'appareil"
    echo "   - Cliquez sur 'PROFIL DE DÉVELOPPEUR'"
    echo "   - Cliquez sur 'Faire confiance à Lucas Pellegrino'"
    echo ""
    echo "2. Une fois approuvé, WDA se lancera automatiquement"
    echo ""
    echo "Appuyez sur Ctrl+C pour arrêter une fois WDA lancé"

    wait $XCODE_PID
else
    echo ""
    echo "❌ Erreur de compilation"
    echo ""
    echo "Solutions:"
    echo "1. Ouvrez Xcode manuellement: open $WDA_PATH/WebDriverAgent.xcodeproj"
    echo "2. Sélectionnez WebDriverAgentRunner"
    echo "3. Dans Signing & Capabilities, configurez votre Team"
    echo "4. Lancez avec le bouton Play"
fi