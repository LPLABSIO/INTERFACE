# 🚀 Scripts de Setup Initial

Scripts pour la configuration initiale de l'environnement iOS.

## install-wda-xcode.sh

Script d'installation initiale de WebDriverAgent sur un nouvel iPhone.

### 🎯 Utilisation

```bash
./scripts/setup/install-wda-xcode.sh
```

### 📱 Quand l'utiliser

**UNIQUEMENT pour la première installation sur un nouvel iPhone** :
- Première fois que vous connectez un iPhone
- Après avoir réinitialisé un iPhone
- Si WDA n'a jamais été installé sur l'appareil

### ⚙️ Ce que fait le script

1. **Compile WebDriverAgent** avec votre Team ID Apple
2. **Installe WDA** sur l'iPhone
3. **Guide pour l'approbation** du profil développeur
4. **Lance WDA** pour vérifier l'installation

### 📋 Prérequis

- Xcode installé
- Apple Developer account (gratuit ou payant)
- iPhone connecté en USB
- iPhone déverrouillé et "Faire confiance" accepté

### 🔧 Configuration

Modifier les variables dans le script si nécessaire :

```bash
UDID="af5afd94d5a9256554e735003c2f72fd16ec22f8"  # Votre UDID
TEAM_ID="JLS2F99MK6"                              # Votre Team ID Apple
WDA_PATH="/Users/lucaspellegrino/Downloads/WebDriverAgent-master"
```

### 📱 Étapes sur l'iPhone

Après l'installation, sur l'iPhone :

1. **Si popup "Développeur non approuvé"** :
   - Réglages → Général → VPN et gestion d'appareil
   - Cliquer sur "PROFIL DE DÉVELOPPEUR"
   - Cliquer sur "Faire confiance à [Votre nom]"

2. **Vérifier que WDA est lancé** :
   - Une icône WDA apparaît brièvement
   - L'écran devient noir avec "Automation Running"

### ✅ Après l'installation

Une fois WDA installé avec succès :
- Plus besoin de ce script pour cet iPhone
- L'interface gère automatiquement WDA
- Utiliser `npm run ui` pour lancer normalement

### ⚠️ Important

**Ce script n'est nécessaire qu'UNE SEULE FOIS par iPhone !**

Après l'installation initiale, l'interface gère tout automatiquement via :
- DeviceDiscovery pour détecter WDA
- Appium pour lancer WDA si nécessaire
- Configuration automatique des ports

---

*Pour l'utilisation quotidienne, utiliser l'interface : `npm run ui`*