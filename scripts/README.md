# 📁 Scripts Directory

Scripts utilitaires pour la plateforme iOS Automation.

## 📂 Structure

```
scripts/
├── debug/              # Scripts de dépannage
├── setup/              # Scripts d'installation initiale
├── photo_upload.sh     # Upload de photos via SSH (jailbreak)
└── start_appium.sh     # Lancement du serveur Appium
```

## 🚀 start_appium.sh

Script de lancement du serveur Appium avec configuration optimisée.

### Utilisation

```bash
# Via npm (recommandé)
npm run appium

# Ou directement
./scripts/start_appium.sh
```

### Fonctionnalités

1. **Arrête** toute instance Appium existante
2. **Attend** 2 secondes pour libération du port
3. **Lance** Appium avec les options :
   - `--base-path /wd/hub` : Chemin de base WebDriver
   - `--port 4723` : Port standard Appium
   - `--relaxed-security` : Mode développement
   - `--session-override` : Remplace sessions existantes

### Quand l'utiliser

- Au démarrage du système
- Si Appium ne répond plus
- Pour reset les sessions WebDriver
- En cas de problème de connexion avec les devices

### Note

L'interface UI lance automatiquement Appium si nécessaire. Ce script est utile pour :
- Lancement manuel indépendant
- Debug de problèmes Appium
- Tests isolés

## 📱 photo_upload.sh

Script d'upload de photos pour appareils jailbreakés.

**⚠️ Nécessite :**
- iPhone jailbreaké
- IP configurée (actuellement 192.168.254.119)
- Outil `photomanager` installé

## 📚 Autres Scripts

- **debug/** : Scripts de dépannage WebDriverAgent
- **setup/** : Installation initiale WDA sur nouveaux iPhones

Voir les README dans chaque sous-dossier pour plus de détails.