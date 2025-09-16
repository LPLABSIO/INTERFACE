# 🏗️ Plan de Restructuration Immédiate

## Structure Actuelle (Problématique)
```
INTERFACE/
├── AppiumUI/        # ⚠️ Ancienne UI à supprimer
├── electron/        # ⚠️ Nouvelle UI mal placée
├── HINGE/          # ⚠️ Tout mélangé
├── node_modules/
├── *.md (6 fichiers) # ⚠️ Docs à la racine
└── configs...      # ⚠️ Dispersés
```

## Structure Cible (Phase 1 - Immédiate)
```
INTERFACE/
├── docs/                    # 📚 Documentation centralisée
│   ├── ARCHITECTURE.md
│   ├── ROADMAP.md
│   ├── PROGRESS.md
│   ├── MIGRATION_PLAN.md
│   ├── PROJET.md
│   └── CLAUDE.md
│
├── src/                     # 💻 Code source organisé
│   ├── ui/                 # Interface Electron
│   │   ├── main/           # Process principal
│   │   │   └── main.js
│   │   ├── renderer/       # Interface utilisateur
│   │   │   ├── index.html
│   │   │   ├── renderer.js
│   │   │   └── styles.css
│   │   └── preload/
│   │       └── preload.js
│   │
│   ├── bot/                # Logique bot (depuis HINGE)
│   │   ├── bot.js
│   │   ├── multi.js
│   │   └── src/            # Modules bot
│   │
│   └── shared/             # Modules partagés
│       ├── device-manager.js
│       ├── logger.js
│       └── utils.js
│
├── config/                  # ⚙️ Configuration centralisée
│   ├── app/
│   │   ├── data.json
│   │   ├── devices.json
│   │   └── appium_servers.json
│   └── build/
│       └── electron-builder.yml
│
├── data/                    # 📊 Données projet
│   ├── locations/
│   ├── profiles/
│   └── logs/
│
├── scripts/                 # 🔧 Scripts utilitaires
│   ├── setup.sh
│   ├── clean.sh
│   └── start-appium.sh
│
├── tests/                   # 🧪 Tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── .github/                 # CI/CD
│   └── workflows/
│
├── package.json
├── .gitignore
├── .eslintrc.js
└── README.md
```

## Actions de Restructuration

### 1️⃣ Créer la nouvelle structure
```bash
# Créer les dossiers principaux
mkdir -p docs src/ui/{main,renderer,preload} src/bot src/shared
mkdir -p config/{app,build} data/{locations,profiles,logs}
mkdir -p scripts tests/{unit,integration,e2e}
mkdir -p .github/workflows
```

### 2️⃣ Déplacer les fichiers existants
```bash
# Documentation
mv *.md docs/ 2>/dev/null

# UI Electron
mv electron/main.js src/ui/main/
mv electron/renderer/* src/ui/renderer/
mv electron/preload.js src/ui/preload/

# Bot HINGE
cp -r HINGE/*.js src/bot/
cp -r HINGE/src/* src/bot/src/

# Configuration
cp -r HINGE/config/* config/app/
mv electron-builder.yml config/build/

# Data
cp HINGE/*.csv data/locations/
cp HINGE/*.txt data/profiles/
```

### 3️⃣ Nettoyer les anciens dossiers
```bash
# Supprimer l'ancienne structure (après backup)
rm -rf AppiumUI
rm -rf electron
# Garder HINGE temporairement pour référence
```

### 4️⃣ Mettre à jour les imports
- Adapter tous les chemins dans les fichiers JS
- Mettre à jour package.json scripts
- Corriger les références dans la documentation

## Bénéfices de cette Restructuration

✅ **Clarté** : Séparation claire UI / Bot / Shared
✅ **Modularité** : Modules réutilisables dans shared/
✅ **Organisation** : Configs centralisées
✅ **Maintenabilité** : Structure standard Node.js
✅ **Scalabilité** : Prêt pour monorepo futur
✅ **Documentation** : Regroupée et accessible
✅ **Tests** : Structure prête pour TDD

## Script de Migration Automatique

```bash
#!/bin/bash
# restructure.sh

echo "🏗️  Restructuration du projet..."

# Backup
echo "📦 Création backup..."
cp -r . ../INTERFACE_BACKUP_$(date +%Y%m%d_%H%M%S)

# Création structure
echo "📁 Création nouvelle structure..."
mkdir -p docs src/ui/{main,renderer,preload} src/bot/src src/shared
mkdir -p config/{app,build} data/{locations,profiles,logs}
mkdir -p scripts tests/{unit,integration,e2e}

# Migration fichiers
echo "📋 Migration des fichiers..."

# Docs
mv ARCHITECTURE.md ROADMAP.md PROGRESS.md MIGRATION_PLAN.md PROJET.md CLAUDE.md docs/ 2>/dev/null

# UI
mv electron/main.js src/ui/main/main.js 2>/dev/null
mv electron/renderer/* src/ui/renderer/ 2>/dev/null
mv electron/preload.js src/ui/preload/preload.js 2>/dev/null

# Bot
cp HINGE/bot.js HINGE/multi.js src/bot/ 2>/dev/null
cp -r HINGE/src/* src/bot/src/ 2>/dev/null

# Config
cp -r HINGE/config/* config/app/ 2>/dev/null
mv electron-builder.yml config/build/ 2>/dev/null

# Data
cp HINGE/*.csv data/locations/ 2>/dev/null
cp HINGE/*.txt data/profiles/ 2>/dev/null

echo "✅ Restructuration terminée!"
echo "⚠️  N'oubliez pas de:"
echo "  1. Mettre à jour les imports dans les fichiers JS"
echo "  2. Modifier package.json"
echo "  3. Tester que tout fonctionne"
```

## Prochaines Étapes

1. **Exécuter la restructuration**
2. **Mettre à jour package.json**
3. **Corriger les imports**
4. **Tester l'application**
5. **Commit de la nouvelle structure**