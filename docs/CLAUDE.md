# CLAUDE.md

Ce fichier fournit des indications à Claude Code (claude.ai/code) lors du travail avec le code de ce dépôt.

## Vue d'ensemble du projet

Ce dépôt contient une **plateforme d'automatisation iOS multi-appareils** professionnelle :
- **INTERFACE** : Application Electron pour la gestion et le monitoring des appareils
- **HINGE** : Module de bot d'automatisation pour applications (Hinge, Tinder, POF)
- **Production System** : Système de production multi-appareils avec gestion des ressources

## Architecture Actuelle

```
INTERFACE/
├── src/
│   ├── ui/                      # Interface Electron
│   │   ├── main/main.js        # Process principal avec IPC
│   │   ├── renderer/            # Pages HTML/JS
│   │   │   ├── index.html      # Interface principale avec logs multi-appareils
│   │   │   ├── production.html # Page de production avec ResourceManager
│   │   │   └── production.js   # Gestion des ressources et allocation
│   │   └── preload/            # Bridge sécurisé
│   ├── core/                   # Orchestration
│   │   └── AppOrchestrator.js # Coordination multi-appareils
│   └── bot/                    # Scripts d'exécution
├── HINGE/                      # Module bot autonome
│   ├── bot.js                  # Point d'entrée principal
│   └── src/
│       ├── hinge.js           # Automatisation Hinge
│       ├── email.js           # Gestion emails (getAndRemoveEmail)
│       └── locations.js       # Gestion locations (loadLocations)
├── config/app/                 # Configuration centralisée
│   ├── data.json              # Config principale
│   ├── devices.json           # UUIDs des appareils
│   ├── state.json             # État de progression
│   └── appium_servers.json    # Mapping ports Appium
└── data/resources/            # Pools de ressources
    ├── emails.txt             # Liste d'emails
    └── locations.txt          # Liste de locations
```

## Commandes courantes

### Interface de Production

```bash
# Lancer l'interface Electron
npm run ui

# Scanner les appareils iOS connectés
npm run scan:devices

# Démarrer la production multi-appareils
# (Via l'interface graphique - onglet Production)
```

### Système de Bot HINGE

```bash
# Exécution manuelle d'un bot
cd HINGE
node bot.js <device> <app>    # Ex: node bot.js iphonex hinge

# Variables d'environnement requises
APPIUM_HOST=127.0.0.1
APPIUM_PORT=1265
APPIUM_UDID=<device-udid>
WDA_PORT=8100
```

## Flux de Production Multi-Appareils

### 1. Détection et Configuration
- L'interface scanne les appareils iOS via `idevice_id`
- Allocation dynamique des ports (Appium: 1265+, WDA: 8100+)
- Configuration stockée dans `config/app/devices.json`

### 2. Gestion des Ressources
```javascript
// Production.js - ResourceManager
class ResourceManager {
    allocateResources(deviceId) {
        return {
            email: this.getNextEmail(),
            location: this.getNextLocation(),
            proxy: this.getNextProxy()
        };
    }
}
```

### 3. Lancement des Bots
- Appium démarre pour chaque appareil
- Variables d'environnement passées au bot
- Logs temps réel via IPC

### 4. Communication IPC
```javascript
// Canaux principaux
'scan-devices'        // Détection appareils
'start-production'    // Lancer production
'appium-log'         // Logs Appium
'script-log'         // Logs du bot
'system-log'         // Logs système
```

## Problème Actuel : Gestion des Ressources

### Conflit Multi-Appareils
Le bot HINGE utilise actuellement :
```javascript
// ❌ Problème : accès concurrent aux fichiers
const email = await getAndRemoveEmail('email_hinge.txt');
const location = await loadLocations('locations.csv');
```

### Solution Proposée
Utiliser le ResourceManager de production.js :
```javascript
// ✅ Solution : allocation via ResourceManager
const resources = await resourceManager.allocate(deviceId);
const email = resources.email;
const location = resources.location;
```

## Fichiers de Configuration

### config/app/data.json
```json
{
  "devices": [],
  "settings": {
    "appiumBasePort": 1265,
    "wdaBasePort": 8100
  }
}
```

### config/app/state.json
```json
{
  "devices": {
    "<udid>": {
      "created": 0,
      "target": 10,
      "status": "idle"
    }
  }
}
```

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