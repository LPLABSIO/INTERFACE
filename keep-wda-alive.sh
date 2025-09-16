#!/bin/bash

echo "🔄 Gardien WebDriverAgent - Maintient WDA actif"
echo "================================================"

UDID="af5afd94d5a9256554e735003c2f72fd16ec22f8"

# Fonction pour vérifier si WDA est actif
check_wda() {
    curl -s http://127.0.0.1:8100/status > /dev/null 2>&1
    return $?
}

# Fonction pour envoyer une commande keep-alive
keep_alive() {
    curl -s -X GET http://127.0.0.1:8100/status > /dev/null 2>&1
}

# Configuration du tunnel iproxy si nécessaire
setup_tunnel() {
    echo "🔗 Configuration du tunnel iproxy..."
    pkill -f "iproxy 8100" 2>/dev/null || true
    iproxy 8100 8100 $UDID &
    sleep 2
}

# Vérifier et configurer le tunnel
if ! check_wda; then
    echo "⚠️ WDA non accessible, configuration du tunnel..."
    setup_tunnel
fi

echo "✅ Gardien WDA démarré"
echo "📱 Assurez-vous que WebDriverAgent est lancé sur votre iPhone"
echo ""

# Boucle de maintien
while true; do
    if check_wda; then
        echo -ne "\r✅ WDA actif $(date '+%H:%M:%S')"
        keep_alive
    else
        echo -ne "\r⚠️ WDA inactif $(date '+%H:%M:%S') - Lancez WDA sur votre iPhone"
    fi
    sleep 5
done