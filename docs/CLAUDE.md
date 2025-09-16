# CLAUDE.md

Ce fichier fournit des indications à Claude Code (claude.ai/code) lors du travail avec le code de ce dépôt.

## Vue d'ensemble du projet

Ce dépôt contient deux systèmes intégrés :
- **HINGE** : Système de bot d'automatisation d'applications de rencontre iOS utilisant Appium/WebDriverIO
- **AppiumUI** : Interface Electron pour gérer les serveurs Appium et l'orchestration des bots

## Commandes courantes

### Développement et exécution

```bash
# Interface AppiumUI
npm run ui                     # Lancer l'interface de gestion Electron
npm run build:mac             # Construire l'application Mac

# Système de bot HINGE
cd HINGE
npm run devices:scan          # Scanner et sauvegarder les appareils iOS connectés dans config/devices.json
npm run multi                 # Exécuter l'orchestration multi-appareils
node bot.js <device> <app>    # Exécuter un bot unique (ex: node bot.js iphonex hinge)
./start_appium.sh             # Démarrer les serveurs Appium (ports 4723-4733)
```

### Tests et débogage

```bash
# Tester la connexion Appium
node -e "console.log(require('./HINGE/src/deviceManager').getDevices())"

# Vérifier la connectivité proxy
node -e "require('./HINGE/src/proxy').testProxy('host', port, 'user', 'pass')"
```

## Architecture et modèles clés

### Flux d'orchestration multi-appareils
1. `multi.js` lit les configurations d'appareils depuis `config/data.json` et `config/devices.json`
2. Lance des processus `bot.js` individuels pour chaque appareil avec des ports Appium spécifiques
3. Chaque instance de bot se connecte à son serveur Appium assigné (mapping des ports dans config)
4. La gestion d'état suit la progression à travers les appareils dans `config/state.json`

### Modèle d'exécution du bot
Tous les modules d'applications de rencontre (`hinge.js`, `tinder.js`, `pof.js`) suivent ce modèle :
```javascript
async function main(driver, device, smsProvider, emailProvider, proxy) {
    // 1. Configuration proxy/VPN via les modules shadowrocket/ghost/crane
    // 2. Navigation dans l'app avec les commandes WebDriverIO
    // 3. Gestion de la vérification via les fournisseurs SMS/email
    // 4. Exécution des tâches d'automatisation
    // 5. Retour du statut succès/échec
}
```

### Architecture de gestion des proxies
Le système utilise une approche de proxy en couches :
1. **Proxy.js** valide et établit les connexions SOCKS5
2. **Applications VPN** (shadowrocket, ghost, crane, orbit, geranium) configurent les proxies sur l'appareil
3. **Vérificateur de fraude** valide la qualité de l'IP avant utilisation
4. **Services de localisation** s'assurent que la localisation du proxy correspond à celle de l'application

### Fichiers de configuration critiques

**HINGE/config/data.json** - Configuration principale :
- `devices` : Tableau de configurations d'appareils avec ports Appium/WDA
- `proxyProvider` : Identifiants du service proxy (marsproxies, etc.)
- `smsProvider` : Clés API du service SMS (api21k, daisysms, smspool)
- `emailSettings` : Configuration IMAP pour la vérification Gmail

**HINGE/config/devices.json** - UUIDs des appareils connectés (auto-généré par `npm run devices:scan`)

**HINGE/config/appium_servers.json** - Mapping des ports des serveurs Appium

## Considérations techniques clés

### Sélection d'éléments WebDriverIO
Le code utilise des chaînes de prédicat iOS et des IDs d'accessibilité :
```javascript
await driver.$('-ios predicate string:type == "XCUIElementTypeButton" AND name CONTAINS "Continue"')
await driver.$('~accessibility-id')
```

### Gestion des serveurs Appium
- Chaque appareil nécessite un port Appium unique (4723-4733) et un port WDA (8100-8110)
- Les serveurs doivent être démarrés avant l'exécution du bot (`./start_appium.sh`)
- AppiumUI fournit une interface graphique pour la gestion des serveurs

### Intégration des fournisseurs SMS/Email
- SMS principal : api21k.js avec les méthodes getNumber() et getCode()
- Secours : daisysms.js avec la même interface
- Email : Utilise IMAP pour récupérer les codes de vérification depuis Gmail

### Gestion de la localisation
- Les fichiers CSV contiennent des localisations prédéfinies (locations_usa_tinder.csv, etc.)
- Turf.js randomise les positions dans un rayon de la localisation sélectionnée
- Doit correspondre à la localisation géographique du proxy pour la prévention de la fraude

## Flux de développement

1. **Ajout du support d'une nouvelle application de rencontre** :
   - Créer un nouveau module dans `HINGE/src/` suivant les modèles existants
   - Implémenter la fonction main() avec les paramètres standards
   - Ajouter le cas de l'app dans le switch de `bot.js`
   - Mettre à jour `config/data.json` avec les paramètres spécifiques à l'app

2. **Ajout d'un nouveau fournisseur de proxy** :
   - Créer un module dans `HINGE/src/` avec la méthode setupProxy()
   - Implémenter l'automatisation UI pour la configuration de l'app proxy
   - Ajouter le cas du fournisseur dans la logique de configuration proxy de bot.js

3. **Débogage des problèmes d'automatisation** :
   - Activer la journalisation détaillée dans utils.js
   - Utiliser Appium Inspector pour identifier les sélecteurs d'éléments
   - Vérifier `HINGE/logs/` pour les traces d'exécution
   - Vérifier le statut du serveur Appium sur les ports configurés

## Dépendances critiques

- **WebDriverIO** (^9.12.3) : Client d'automatisation principal
- **Appium** : Serveur d'automatisation iOS (nécessite une installation séparée)
- **libimobiledevice** : Communication avec les appareils iOS (brew install)
- **Electron** (^31.3.0) : Framework d'interface desktop
- **socks-proxy-agent** (^8.0.5) : Support proxy SOCKS5
- **@turf/turf** (^7.2.0) : Calculs géographiques