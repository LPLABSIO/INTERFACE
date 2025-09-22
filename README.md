# 🤖 iOS Automation Platform

## 📋 Description
Plateforme professionnelle d'automatisation iOS multi-appareils avec interface de contrôle centralisée. Conçue pour gérer jusqu'à 50+ appareils simultanément avec gestion intelligente des ressources.

## 🚀 Quick Start

```bash
# Installation
npm install

# Lancer l'API Server
npm start

# Lancer l'interface graphique
npm run ui

# Mode développement
npm run dev
```

## 📁 Structure du Projet

```
INTERFACE/
├── 🖥️ src/                        # Code source principal
│   ├── ui/                        # Interface Electron
│   │   ├── main/                  # Process principal (gestion appareils)
│   │   ├── renderer/              # Interface utilisateur (HTML/CSS/JS)
│   │   └── preload/               # Bridge IPC sécurisé
│   ├── core/                      # Orchestration centrale
│   │   ├── AppOrchestrator.js    # Orchestrateur principal
│   │   ├── LocationManager.js    # Gestion thread-safe des locations
│   │   ├── ResourceManager.js    # Allocation des ressources (emails, etc)
│   │   └── QueueManager.js        # File de tâches multi-appareils
│   ├── bot/                       # Scripts d'automatisation
│   │   ├── bot.js                # Bot principal (environnement vars)
│   │   └── multi.js              # Orchestration multi-devices
│   └── api/                      # API REST et WebSocket
│       └── server.js             # Serveur principal
│
├── 🔧 SHARED/                     # Modules réutilisables
│   ├── proxy-manager/            # Validation et gestion des proxies
│   ├── sms-providers/            # Fournisseurs SMS (api21k, daisysms, smspool)
│   ├── ios-apps/                 # Apps iOS helper
│   │   ├── shadowrocket.js      # Configuration proxy
│   │   ├── crane.js              # Reset conteneurs
│   │   ├── ghost.js              # Device spoofing
│   │   ├── orbit.js              # VPN settings
│   │   └── geranium.js           # GPS spoofing
│   ├── email-manager/            # Gestion centralisée des emails
│   ├── notifications/            # Notifications (Telegram, etc)
│   └── utils/                    # Utilitaires WebDriver
│
├── 🤖 BOTS/                       # Scripts par application
│   ├── hinge/                    # Automatisation Hinge
│   │   └── index.js
│   ├── tinder/                   # Automatisation Tinder
│   │   ├── index.js
│   │   └── blazex.js            # Extension BlazeX
│   └── pof/                      # Automatisation POF
│       └── index.js
│
├── 📦 packages/@shared/           # Modules NPM internes
│   ├── device-manager/           # Gestion avancée des appareils iOS
│   ├── session-manager/          # Sessions WebDriver
│   ├── queue-manager/            # File de tâches avancée
│   ├── process-manager/          # Gestion des processus
│   ├── state-manager/            # Persistance d'état
│   └── error-recovery/           # Récupération d'erreurs
│
├── ⚙️ config/                     # Configuration
│   ├── app/                      # Config application
│   └── build/                    # Config build Electron
│
├── 📊 data/                       # Données et ressources
│   ├── locations/                # CSV des villes US (165 villes)
│   ├── locations-state.json      # État actuel des locations
│   ├── resources-state.json      # État des ressources (emails)
│   ├── profiles/                 # Templates de profils
│   └── logs/                     # Logs d'exécution
│
├── 📚 docs/                       # Documentation complète
│   ├── ARCHITECTURE.md          # Architecture technique
│   ├── ROADMAP.md               # Plan de développement (7 phases)
│   ├── PROGRESS.md              # Suivi d'avancement
│   └── CLAUDE.md                # Guide pour Claude AI
│
└── 📝 Fichiers racine
    ├── package.json             # Dependencies (v0.2.0)
    ├── .gitignore
    └── README.md                # Ce fichier

```

## 🎯 Fonctionnalités Principales

### ✅ Phase 5 - Production Ready (100%)
- **Multi-Device Management**: Gestion jusqu'à 50+ appareils iOS simultanément
- **Resource Management Thread-Safe**: LocationManager et ResourceManager
- **Queue System**: Distribution intelligente des tâches
- **Error Recovery**: Système robuste de récupération d'erreurs
- **Real-time Monitoring**: Interface Electron avec updates temps réel
- **WebSocket API**: Communication bidirectionnelle

### 🚧 Phase 6 - Advanced Features (40%)
- **Smart Queue Prioritization**: Priorités dynamiques
- **Health Monitoring**: Surveillance santé système
- **Auto-Recovery**: Récupération automatique
- **Metrics Dashboard**: Tableaux de bord avancés

### 📝 Phase 7 - Script Optimization (Planifié)
- Optimisation du script Hinge (actuellement incomplet)
- Ajout de variations dynamiques
- Système de templates adaptatifs

## 💡 Architecture Highlights

### Thread-Safe Resource Management
```javascript
// LocationManager - Allocation sécurisée des villes
const location = await locationManager.acquireLocation();
// Utilisation...
await locationManager.releaseLocation(location.city);

// ResourceManager - Gestion des emails par app
const email = await resourceManager.acquireEmail('hinge');
// Utilisation...
await resourceManager.releaseEmail(email);
```

### Queue System Multi-Device
```javascript
// Ajout de tâches avec priorité
await queueManager.addTask({
  type: 'CREATE_ACCOUNT',
  app: 'hinge',
  priority: TaskPriority.HIGH,
  data: { location, phone, proxy }
});
```

### Error Recovery Automatique
```javascript
// Protection EPIPE intégrée
// Retry automatique avec backoff exponentiel
// Health monitoring en temps réel
```

## 🔧 Configuration

### Variables d'Environnement
```bash
# Connexion Appium/WDA
APPIUM_HOST=127.0.0.1
APPIUM_PORT=4723
APPIUM_UDID=auto              # ou UUID spécifique
WDA_PORT=8100
WDA_URL=http://192.168.1.57:8100

# Configuration apps
HINGE_EMAIL=email@example.com
HINGE_LOCATION='{"city":"Austin","state":"TX","lat":30.2672,"lon":-97.7431}'

# Notifications
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id

# Email IMAP (pour récupération codes)
GMAIL_IMAP_USER=user@gmail.com
GMAIL_IMAP_PASS=app_specific_password
```

## 📊 Commandes NPM

```bash
# Interface et Production
npm start               # Démarre l'API server (port 3000)
npm run ui             # Lance l'interface Electron
npm run dev            # Mode développement

# Bots
npm run bot            # Lance un bot single
npm run multi          # Orchestration multi-devices

# Maintenance
npm run clean          # Nettoyer les fichiers temporaires
npm run lint           # Vérifier le code
npm run format         # Formater le code

# Build
npm run build:mac      # Build pour macOS
npm run build:win      # Build pour Windows
```

## 📈 Métriques Système

| Métrique | Valeur |
|----------|--------|
| **Appareils supportés** | 50+ simultanément |
| **Temps création compte** | ~3-5 minutes |
| **Success rate** | 85-95% |
| **Locations disponibles** | 165 villes US |
| **Providers SMS** | 3 (api21k, daisysms, smspool) |
| **Providers Proxy** | 2 (marsproxies, oxylabs) |

## 🚀 Roadmap

### Phase Actuelle: 6 - Advanced Features
- [x] Queue prioritization
- [x] Health monitoring
- [ ] ML-based optimization
- [ ] Advanced analytics

### Prochaine Phase: 7 - Script Optimization
- [ ] Compléter le script Hinge (après première prompt)
- [ ] Ajouter variations dynamiques
- [ ] Templates adaptatifs par région
- [ ] A/B testing intégré

## 🛠️ Technologies Utilisées

- **Frontend**: Electron, HTML5, CSS3, JavaScript
- **Backend**: Node.js, Express, Socket.io
- **Automation**: WebDriverIO, Appium, XCUITest
- **iOS Apps**: Shadowrocket, Crane, Ghost, Orbit, Geranium
- **Database**: JSON files (migration vers SQLite prévue)
- **Process**: Multi-threading, IPC, Worker threads

## 📝 Notes Importantes

1. **EPIPE Errors**: Résolu avec protection multi-niveaux
2. **Thread Safety**: LocationManager et ResourceManager thread-safe
3. **Scalabilité**: Architecture prête pour 50+ appareils
4. **Modularité**: Modules SHARED réutilisables entre apps
5. **Clean Architecture**: Séparation claire UI/Core/Bot

## 🤝 Contribution

Pour contribuer au projet:
1. Fork le repository
2. Créer une branche feature
3. Commiter les changements
4. Push vers la branche
5. Ouvrir une Pull Request

## 📄 License

MIT

---

*Dernière mise à jour: 19/09/2025*
*Version: 0.2.0*