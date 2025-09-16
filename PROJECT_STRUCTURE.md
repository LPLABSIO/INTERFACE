# 📁 Structure du Projet - iOS Automation Platform

## ✅ Structure Actuelle (Nettoyée et Organisée)

```
ios-automation-platform/
│
├── 📚 docs/                       # Documentation complète
│   ├── ARCHITECTURE.md           # Architecture technique
│   ├── ROADMAP.md                # Plan de développement
│   ├── PROGRESS.md               # Suivi d'avancement
│   ├── MIGRATION_PLAN.md         # Plan de migration
│   ├── PROJET.md                 # Vision produit
│   ├── CLAUDE.md                 # Guide Claude AI
│   └── RESTRUCTURE_PLAN.md       # Plan de restructuration
│
├── 💻 src/                        # Code source organisé
│   ├── ui/                       # Interface Electron
│   │   ├── main/
│   │   │   └── main.js          # Process principal (876 lignes)
│   │   ├── renderer/
│   │   │   ├── index.html       # Interface HTML (251 lignes)
│   │   │   ├── renderer.js      # Logique UI (540 lignes)
│   │   │   └── styles.css       # Styles (900+ lignes)
│   │   └── preload/
│   │       └── preload.js       # Bridge IPC (92 lignes)
│   │
│   ├── bot/                      # Logique d'automatisation
│   │   ├── bot.js               # Bot principal
│   │   ├── multi.js             # Orchestration multi-devices
│   │   └── src/                 # Modules bot (28 fichiers)
│   │       ├── hinge.js         # Automatisation Hinge
│   │       ├── tinder.js        # Automatisation Tinder
│   │       ├── deviceManager.js # Gestion appareils
│   │       ├── proxy.js         # Gestion proxies
│   │       └── ...              # Autres modules
│   │
│   └── shared/                   # Modules partagés (à développer)
│
├── ⚙️ config/                     # Configuration centralisée
│   ├── app/
│   │   ├── data.json            # Config principale
│   │   ├── devices.json         # Appareils connectés
│   │   ├── appium_servers.json  # Mapping serveurs
│   │   └── state.json           # État des sessions
│   └── build/
│       └── electron-builder.yml # Config build
│
├── 📊 data/                       # Données projet
│   ├── locations/               # Fichiers CSV géolocalisation
│   ├── profiles/                # Templates email/profils
│   └── logs/                    # Fichiers de logs
│
├── 🔧 scripts/                    # Scripts utilitaires
│   └── start_appium.sh          # Démarrage Appium
│
├── 🧪 tests/                      # Tests (à implémenter)
│   ├── unit/                    # Tests unitaires
│   ├── integration/             # Tests d'intégration
│   └── e2e/                     # Tests end-to-end
│
├── 🚀 .github/                    # CI/CD (à configurer)
│   └── workflows/               # GitHub Actions
│
├── 📦 node_modules/               # Dépendances (250 packages)
│
├── 📝 Fichiers racine
│   ├── package.json             # Config npm (v0.2.0)
│   ├── package-lock.json        # Lock dependencies
│   ├── README.md                # Documentation principale
│   ├── .eslintrc.js            # Config ESLint
│   ├── .prettierrc             # Config Prettier
│   └── .gitignore              # Fichiers ignorés Git
│
└── 🗂️ HINGE/                      # Ancien dossier (à supprimer après validation)
```

## 📊 Statistiques du Projet

| Catégorie | Détails |
|-----------|---------|
| **Documentation** | 8 fichiers MD, ~500 KB |
| **Code Source** | ~40 fichiers JS, ~2,500 lignes |
| **Interface** | HTML/CSS/JS moderne |
| **Configuration** | JSON centralisé |
| **Tests** | Structure prête |
| **Total Size** | ~30 MB (sans node_modules) |

## 🎯 Améliorations Apportées

### ✅ Organisation
- Documentation regroupée dans `docs/`
- Code source structuré dans `src/`
- Configuration centralisée dans `config/`
- Données séparées dans `data/`

### ✅ Modularité
- UI séparée de la logique métier
- Bot modules isolés
- Shared modules pour réutilisation

### ✅ Maintenabilité
- Structure standard Node.js/Electron
- ESLint + Prettier configurés
- Scripts npm organisés

### ✅ Scalabilité
- Prêt pour monorepo
- Structure extensible
- Tests framework ready

## 🚀 Commandes Disponibles

```bash
# Interface
npm run ui          # Lancer l'interface Electron
npm run dev         # Mode développement

# Bot
npm run bot         # Lancer un bot single
npm run multi       # Orchestration multi-devices

# Build
npm run build:mac   # Build pour macOS
npm run build:win   # Build pour Windows

# Maintenance
npm run clean       # Nettoyer tout
npm run lint        # Vérifier le code
npm run format      # Formater le code

# Setup
npm run setup       # Installation complète
npm run appium      # Démarrer Appium
```

## ✨ Prochaines Étapes

1. **Immédiat**
   - [ ] Supprimer le dossier `HINGE/` après validation
   - [ ] Mettre à jour les imports dans les fichiers JS
   - [ ] Tester l'interface avec la nouvelle structure

2. **Court terme**
   - [ ] Extraire modules partagés dans `src/shared/`
   - [ ] Implémenter tests de base
   - [ ] Configurer GitHub Actions

3. **Moyen terme**
   - [ ] Migration vers TypeScript
   - [ ] Ajout de tests complets
   - [ ] Documentation API

## 📝 Notes

- La structure est maintenant **professionnelle et scalable**
- Prête pour le développement en équipe
- Suit les best practices Node.js/Electron
- Facilite l'ajout de nouvelles fonctionnalités

---

*Structure créée le 14/09/2024*
*Version: 0.2.0*