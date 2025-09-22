# CLAUDE.md

Ce fichier fournit des indications à Claude Code (claude.ai/code) lors du travail avec le code de ce dépôt.

## Vue d'ensemble du projet

**Plateforme d'automatisation iOS multi-appareils professionnelle** avec gestion intelligente des ressources :
- **Interface Electron** : Application desktop pour monitoring et contrôle centralisé
- **Architecture modulaire** : Séparation claire entre interface, bots et modules partagés
- **Production System** : Support de 50+ appareils simultanés avec allocation thread-safe

## Architecture Actuelle (v0.2.0)

```
INTERFACE/
├── src/                        # Code source principal
│   ├── ui/                     # Interface Electron
│   │   ├── main/main.js       # Process principal (IPC, device management)
│   │   ├── renderer/           # Pages HTML/JS/CSS
│   │   └── preload/            # Bridge IPC sécurisé
│   ├── core/                   # Orchestration centrale
│   │   ├── AppOrchestrator.js # Coordination multi-appareils
│   │   ├── LocationManager.js # Gestion thread-safe des villes
│   │   ├── ResourceManager.js # Allocation emails/proxies
│   │   └── QueueManager.js    # File de tâches prioritaires
│   ├── bot/                    # Scripts d'automatisation
│   │   ├── bot.js             # Bot principal (variables env)
│   │   └── multi.js           # Orchestration multi-devices
│   └── api/                    # API REST et WebSocket
│       └── server.js          # Serveur Express (port 3000)
│
├── SHARED/                     # Modules réutilisables
│   ├── proxy-manager/         # Validation et gestion proxies
│   ├── sms-providers/         # SMS (api21k, daisysms, smspool)
│   ├── ios-apps/              # Apps helper iOS
│   │   ├── shadowrocket.js   # Configuration proxy
│   │   ├── crane.js           # Reset conteneurs
│   │   ├── ghost.js           # Device spoofing
│   │   ├── orbit.js           # VPN settings
│   │   └── geranium.js        # GPS spoofing
│   ├── email-manager/         # Gestion emails centralisée
│   ├── notifications/         # Telegram, etc.
│   └── utils/                 # Utilitaires WebDriver
│
├── BOTS/                      # Scripts par application
│   ├── hinge/index.js        # Bot Hinge (Phase 7 - optimisation prévue)
│   ├── tinder/                # Bot Tinder + extension BlazeX
│   └── pof/index.js          # Bot POF
│
├── packages/@shared/          # Modules NPM internes (Lerna)
│   ├── device-manager/        # Gestion avancée appareils
│   ├── session-manager/       # Sessions WebDriver
│   ├── queue-manager/         # File de tâches avancée
│   ├── process-manager/       # Gestion des processus
│   ├── state-manager/         # Persistance d'état
│   └── error-recovery/        # Récupération d'erreurs
│
├── data/                      # Données et ressources
│   ├── locations/             # CSV des villes US (165 villes)
│   ├── locations-state.json  # État actuel allocations
│   ├── resources-state.json  # État emails/proxies
│   └── emails/               # Emails par app (hinge.txt, tinder.txt)
│
└── scripts/                   # Scripts utilitaires
    ├── debug/                 # Scripts de dépannage WDA
    ├── setup/                 # Installation initiale iPhone
    └── start_appium.sh       # Lancement Appium
```

## Commandes courantes

### Production Multi-Appareils

```bash
# Lancer l'API server
npm start

# Lancer l'interface graphique
npm run ui

# Mode développement
npm run dev
```

### Configuration Environnement

```bash
# Variables d'environnement bot.js
export APPIUM_HOST=127.0.0.1
export APPIUM_PORT=4723
export APPIUM_UDID=auto
export WDA_PORT=8100
export WDA_URL=http://192.168.1.57:8100

# Configuration apps
export HINGE_EMAIL=email@example.com
export HINGE_LOCATION='{"city":"Austin","state":"TX","lat":30.2672,"lon":-97.7431}'
```

## Flux de Production

### 1. Allocation Thread-Safe des Ressources

```javascript
// LocationManager - Prévention des conflits
const location = await locationManager.acquireLocation();
// Utilisation...
await locationManager.releaseLocation(location.city);

// ResourceManager - Emails par app
const email = await resourceManager.acquireEmail('hinge');
// Utilisation...
await resourceManager.releaseEmail(email);
```

### 2. Queue System avec Priorités

```javascript
// Ajout de tâches prioritaires
await queueManager.addTask({
  type: 'CREATE_ACCOUNT',
  app: 'hinge',
  priority: TaskPriority.HIGH,
  data: { location, phone, proxy }
});
```

### 3. Communication IPC Electron

```javascript
// Canaux principaux
'device:scan'          // Détection appareils iOS
'production:start'     // Lancer production
'production:status'    // État temps réel
'task:complete'        // Tâche terminée
'error:occurred'       // Gestion erreurs
```

## Points d'Attention Techniques

### Sélection d'éléments WebDriverIO
```javascript
// Prédicats iOS
await driver.$('-ios predicate string:type == "XCUIElementTypeButton" AND name CONTAINS "Continue"');

// Accessibility IDs
await driver.$('~accessibility-id');

// Class chains
await driver.$('-ios class chain:**/XCUIElementTypeButton[`name == "Allow"`]');
```

### Gestion EPIPE Errors
- Protection multi-niveaux intégrée
- Global error handler dans main.js
- Retry automatique avec backoff exponentiel

### Architecture Multi-Device
- Ports Appium dynamiques (4723+)
- Ports WDA dynamiques (8100+)
- Isolation complète entre appareils
- Queue centralisée avec priorités

## Flux de Développement

### Ajouter une nouvelle app
1. Créer module dans `BOTS/<app>/index.js`
2. Implémenter interface standard (setup, createAccount, etc.)
3. Ajouter ressources dans `data/emails/<app>.txt`
4. Mettre à jour ResourceManager pour gérer la nouvelle app

### Ajouter un provider SMS
1. Créer module dans `SHARED/sms-providers/<provider>.js`
2. Implémenter interface: `getNumber()`, `getCode()`
3. Ajouter configuration API dans `.env`

### Debug d'automatisation
1. Logs temps réel dans l'interface Electron
2. Vérifier `data/logs/` pour traces complètes
3. Utiliser Appium Inspector pour sélecteurs
4. Scripts debug dans `scripts/debug/`

## Métriques Système

| Métrique | Valeur |
|----------|--------|
| **Appareils supportés** | 50+ simultanément |
| **Temps création compte** | ~3-5 minutes |
| **Success rate** | 85-95% |
| **Locations disponibles** | 165 villes US |
| **Providers SMS** | 3 actifs |
| **Architecture** | Thread-safe, EPIPE protected |

## Phase Actuelle : 6 - Advanced Features (40%)

### Complété
- ✅ Queue prioritization dynamique
- ✅ Health monitoring système
- ✅ Protection EPIPE multi-niveaux
- ✅ Resource management thread-safe

### En cours
- 🚧 ML-based optimization
- 🚧 Advanced analytics
- 🚧 Auto-scaling

### Prochaine Phase : 7 - Script Optimization
- Optimisation complète script Hinge
- Variations dynamiques par région
- Templates adaptatifs
- A/B testing intégré

## Dépendances Critiques

- **WebDriverIO** (^9.19.2) : Client automation
- **Electron** (^31.3.0) : Interface desktop
- **Express** (^5.1.0) : API server
- **Socket.io** (^4.8.1) : WebSocket real-time
- **@turf/turf** (^7.2.0) : Calculs géographiques
- **Lerna** (^8.2.4) : Monorepo management

## Notes Importantes

1. **Thread Safety** : LocationManager et ResourceManager garantissent aucun conflit
2. **EPIPE Protection** : Gestion robuste des erreurs de pipe
3. **Scalabilité** : Architecture prête pour 50+ appareils
4. **Modularité** : SHARED/ pour code réutilisable entre apps
5. **Clean Architecture** : Séparation claire UI/Core/Bot/API