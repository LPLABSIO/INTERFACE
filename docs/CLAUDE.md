# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**iOS Multi-Device Automation Platform** (v0.2.0) - Professional automation system supporting 50+ simultaneous iOS devices with thread-safe resource management and real-time monitoring via Electron interface.

## High-Level Architecture

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

## Essential Commands

### Development & Testing

```bash
# Start API server (port 3000)
npm start

# Launch Electron UI
npm run ui

# Development mode with hot reload
npm run dev

# Run tests
npm test                  # All tests
npm run test:ui          # UI tests via Lerna
npm run api:test         # API tests only

# Code quality
npm run lint             # ESLint check
npm run format           # Prettier formatting

# Clean & rebuild
npm run clean            # Remove build artifacts
npm run bootstrap        # Lerna bootstrap packages
```

### Production Operations

```bash
# Start multi-device production
npm run ui               # Open UI first
# Then use UI to select devices and start production

# Manual bot execution (legacy)
export APPIUM_PORT=4723
export APPIUM_UDID=<device_udid>
export WDA_URL=http://<ip>:8100
npm run bot

# Build executables
npm run build:mac        # macOS build
npm run build:win        # Windows build
```

### Appium & Device Setup

```bash
# Start Appium server
npm run appium           # Uses scripts/start_appium.sh
# Or manually:
npx appium --address 127.0.0.1 --port 4723 --allow-cors

# List connected iOS devices
idevice_id -l

# Get device info
ideviceinfo -u <udid>
```

### Environment Configuration

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

## Key Architecture Patterns

### Thread-Safe Resource Management

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

### Priority Queue System

```javascript
// Ajout de tâches prioritaires
await queueManager.addTask({
  type: 'CREATE_ACCOUNT',
  app: 'hinge',
  priority: TaskPriority.HIGH,
  data: { location, phone, proxy }
});
```

### IPC Communication Channels

```javascript
// Canaux principaux
'device:scan'          // Détection appareils iOS
'production:start'     // Lancer production
'production:status'    // État temps réel
'task:complete'        // Tâche terminée
'error:occurred'       // Gestion erreurs
```

## Critical Technical Patterns

### WebDriverIO Element Selection
```javascript
// Prédicats iOS
await driver.$('-ios predicate string:type == "XCUIElementTypeButton" AND name CONTAINS "Continue"');

// Accessibility IDs
await driver.$('~accessibility-id');

// Class chains
await driver.$('-ios class chain:**/XCUIElementTypeButton[`name == "Allow"`]');
```

### EPIPE Error Handling
- Protection multi-niveaux intégrée
- Global error handler dans main.js
- Retry automatique avec backoff exponentiel

### Multi-Device Port Allocation
- Ports Appium dynamiques (4723+)
- Ports WDA dynamiques (8100+)
- Isolation complète entre appareils
- Queue centralisée avec priorités

## Development Workflows

### Adding New Application Support
1. Créer module dans `BOTS/<app>/index.js`
2. Implémenter interface standard (setup, createAccount, etc.)
3. Ajouter ressources dans `data/emails/<app>.txt`
4. Mettre à jour ResourceManager pour gérer la nouvelle app

### Adding SMS Provider
1. Créer module dans `SHARED/sms-providers/<provider>.js`
2. Implémenter interface: `getNumber()`, `getCode()`
3. Ajouter configuration API dans `.env`

### Debugging Automation Issues
1. Logs temps réel dans l'interface Electron
2. Vérifier `data/logs/` pour traces complètes
3. Utiliser Appium Inspector pour sélecteurs
4. Scripts debug dans `scripts/debug/`

## System Performance Metrics

| Métrique | Valeur |
|----------|--------|
| **Appareils supportés** | 50+ simultanément |
| **Temps création compte** | ~3-5 minutes |
| **Success rate** | 85-95% |
| **Locations disponibles** | 165 villes US |
| **Providers SMS** | 3 actifs |
| **Architecture** | Thread-safe, EPIPE protected |

## Current Development Phase

Phase 7 (Hinge Bot V1) - 100% Complete
- Stable V1 with complete flow from account creation to app termination
- Debug mode with pause/retry instead of crash
- Email fallback (Gmail → Outlook → Hotmail)
- Natural delays between actions (1-2 seconds)
- Random relationship type selection


## Critical Dependencies

- **WebDriverIO** (^9.19.2) : Client automation
- **Electron** (^31.3.0) : Interface desktop
- **Express** (^5.1.0) : API server
- **Socket.io** (^4.8.1) : WebSocket real-time
- **@turf/turf** (^7.2.0) : Calculs géographiques
- **Lerna** (^8.2.4) : Monorepo management

## Important Architectural Decisions

1. **Thread-Safe Managers**: LocationManager and ResourceManager use mutex locks to prevent concurrent access conflicts
2. **EPIPE Protection**: Triple-layer protection against pipe errors in main.js
3. **Dynamic Port Allocation**: Each device gets unique Appium (4723+N) and WDA (8100+N) ports
4. **Shared Modules**: SHARED/ directory contains reusable modules across all bot implementations
5. **Clean Separation**: UI (Electron) → API (Express) → Core (Orchestrator) → Bots (WebDriverIO)
6. **State Management Migration**: UnifiedStateManager centralizes all state (replaces multiple JSON files) with backward compatibility via legacy file sync

## New State Management Pattern (UnifiedStateManager)

The codebase is migrating from multiple scattered JSON files to a centralized UnifiedStateManager:

```javascript
// Old pattern (deprecated)
const state = JSON.parse(fs.readFileSync('data/state.json'));

// New pattern (preferred)
const stateManager = require('./src/core/UnifiedStateManager').getInstance();
await stateManager.initialize();
const uiState = stateManager.get('ui');
await stateManager.set('ui', updatedState);
```

**Namespace mapping:**
- `ui` → Replaces `data/state.json`
- `queue` → Replaces `config/app/queue-state.json`
- `servers` → Replaces `config/app/appium_servers.json`
- `locations` → Replaces `config/app/locations-state.json`
- `resources` → Replaces `config/app/emails-state.json`

**Key features:**
- Automatic migration from legacy files on first run
- Auto-save with 5-second interval
- Backup rotation (5 max backups)
- Legacy sync enabled by default for backward compatibility

## Port Management

The platform includes sophisticated port cleanup utilities in [src/utils/port-cleanup.js](src/utils/port-cleanup.js):

```bash
# Cleanup zombie ports from crashes
node -e "require('./src/utils/port-cleanup').smartCleanup()"

# Common ports used:
# - Appium: 4723-4727, 1265-1269 (custom)
# - WDA: 8100-8104
```

## Debugging Bot Scripts

When working on bot automation scripts (BOTS/*/index.js):

1. **Debug Mode**: Use debug helpers from `SHARED/utils/debug-helpers.js`
   ```javascript
   const { setDebugMode, debugPause, logDebugStep } = require('../../SHARED/utils/debug-helpers');
   setDebugMode(true); // Pauses on errors instead of crashing
   ```

2. **Progress Tracking**: Use progress tracker for visibility
   ```javascript
   const { createProgressTracker } = require('../../SHARED/utils/progress-tracker');
   const tracker = createProgressTracker(totalSteps);
   tracker.update(currentStep, 'Step description');
   ```

3. **Session Validation**: Always validate WebDriver sessions before critical operations
   ```javascript
   const isValid = await validateSession(client, 'operation_name');
   ```