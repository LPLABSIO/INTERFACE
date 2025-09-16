# 📦 Packages - Architecture Monorepo

Cette architecture monorepo organise le code en modules réutilisables et maintenables.

## Structure

```
packages/
├── @shared/              # Modules partagés
│   ├── device-manager/   # Gestion des appareils iOS
│   ├── logger/          # Système de logging centralisé
│   └── appium-manager/  # Gestion des serveurs Appium
│
├── @apps/               # Applications/Bots
│   ├── hinge-bot/      # Bot Hinge
│   ├── tinder-bot/     # Bot Tinder
│   └── pof-bot/        # Bot POF
│
└── @ui/                # Interfaces utilisateur
    └── electron-interface/  # Interface Electron desktop
```

## Modules disponibles

### @shared/device-manager
Gestion unifiée des appareils iOS :
- Détection automatique des appareils
- Configuration plug-and-play
- Discovery automatique de l'IP
- Gestion WDA

### @shared/logger
Système de logging centralisé :
- Logs structurés avec Winston
- Rotation automatique des fichiers
- Support multi-modules
- Logs séparés par service (bot, appium, système)

### @shared/appium-manager (À venir)
Gestion des serveurs Appium :
- Démarrage/arrêt automatique
- Health checks
- Allocation de ports
- Recovery après crash

## Utilisation

### Installation des dépendances
```bash
npm run packages:install
```

### Lancer les tests
```bash
npm run packages:test
```

### Build tous les packages
```bash
npm run packages:build
```

## Développement

### Ajouter un nouveau module partagé
1. Créer le dossier dans `packages/@shared/`
2. Ajouter un `package.json` avec le nom `@shared/nom-module`
3. Implémenter le module
4. Exporter depuis `src/index.js`

### Ajouter un nouveau bot
1. Créer le dossier dans `packages/@apps/`
2. Ajouter un `package.json` avec le nom `@apps/nom-bot`
3. Importer les modules partagés nécessaires
4. Implémenter la logique du bot

### Utiliser un module dans le code principal
```javascript
// Depuis src/
const { deviceManager } = require('../packages/@shared/device-manager');
const logger = require('../packages/@shared/logger');
```

## Avantages de cette architecture

✅ **Modularité** : Chaque fonctionnalité est isolée
✅ **Réutilisabilité** : Modules partagés entre tous les projets
✅ **Maintenabilité** : Plus facile de débugger et tester
✅ **Scalabilité** : Ajout facile de nouveaux bots/features
✅ **Versioning** : Gestion indépendante des versions
✅ **Tests isolés** : Tests unitaires par module

## Migration progressive

L'architecture permet une migration progressive :
1. Phase 1 : Modules de base (device-manager, logger) ✅
2. Phase 2 : Extraction des bots existants
3. Phase 3 : Nouvelle interface modulaire
4. Phase 4 : Publication NPM des modules stables