Modification à faire :

Si popup de la nouvelle version, la fermer sinon conitnuer
Changer le bouton pour modifier la profile avec un "OU"

Régler problème de check API ScamAnlytics

Les publicités apparaissent aléatoirement maintenant (éventuellement, laisser les swipes inchangées mais revenir sur l'app dès qu'on detect le lancement de safari/appstore)

Bouton pour close la nouvelle popup :
name == "Close screen"

OU alors

name == "Maybe later"


pour le profil :
name == "Complete profile" AND label == "Complete profile" AND type == "XCUIElementTypeButton"



# Bot Tinder Appium

Un bot automatisé pour Tinder utilisant Appium pour l'automatisation iOS. Ce bot permet de réinitialiser et de gérer automatiquement les paramètres de l'application Tinder sur un appareil iOS, ainsi que la configuration automatique des applications de proxy nécessaires.

## 📱 Prérequis

- Node.js
- Appium Server
- Un appareil iOS ou un simulateur
- XCode et les outils de développement iOS
- WebDriverAgent configuré
- Applications requises sur l'appareil :
  - Tinder
  - Ghost
  - Shadowrocket

## 🛠 Installation

1. Clonez ce dépôt :

```bash
git clone [votre-repo]
cd appium_tinder
```

2. Installez les dépendances :

```bash
npm install
```

## ⚙️ Configuration

Le bot utilise les configurations suivantes dans `bot.js` :

- Port Appium : 4723
- Version iOS : 15.8
- Configurations d'optimisation des performances Appium
- Gestion des logs automatique

Assurez-vous de mettre à jour l'UDID de votre appareil dans le fichier `bot.js` :

```javascript
'appium:udid': 'votre-udid-ici'
```

### Configuration du Serveur Appium

Lancez le serveur Appium avec les paramètres suivants :

```bash
appium \
  --port 4723 \
  --default-capabilities '{"wdaLocalPort": 8101, "udid": "ec73dd6fe999aa35e849581dd5c16ad8790c137b"}' \
  --relaxed-security
```

## 🚀 Utilisation

1. Démarrez le serveur Appium (voir commande ci-dessus)
2. Lancez le bot :

```bash
node bot.js
```

## 📝 Fonctionnalités

### Gestion de Tinder

- Réinitialisation automatique des données Tinder
- Gestion des permissions de localisation
- Nettoyage du cache et des données de l'application
- Reset de l'enregistrement

### Configuration Ghost

- Activation automatique de l'application Ghost
- Configuration du mode Global
- Activation des paramètres nécessaires

### Configuration Shadowrocket

- Configuration automatique du proxy Socks5
- Paramétrage automatique des serveurs avec :
  - Adresse : 91.239.130.17
  - Port : 44445
  - Identifiants préconfigurés
- Génération de remarques aléatoires pour chaque configuration
- Activation automatique du proxy

### Système de Logging

- Logs détaillés avec horodatage
- Capture des erreurs et des exceptions
- Stockage des logs dans des fichiers datés
- Suivi des opérations en temps réel

## 📂 Structure du Projet

```
.
├── bot.js              # Script principal du bot
├── logs/              # Dossier contenant les logs d'exécution
├── package.json       # Dépendances du projet
└── README.md          # Documentation
```

## 🔍 Logs

Les logs sont automatiquement générés dans le dossier `logs/` avec un horodatage pour chaque session. Ils contiennent :

- Informations détaillées sur l'exécution
- Erreurs et exceptions
- État des applications
- Résultats des opérations

## ⚠️ Notes Importantes

- Assurez-vous que votre appareil iOS est correctement connecté et reconnu
- Vérifiez que WebDriverAgent est bien installé et configuré
- Le bot nécessite les permissions appropriées pour accéder à l'appareil iOS
- Les applications Ghost et Shadowrocket doivent être installées et configurées initialement
- Le proxy configuré utilise des identifiants spécifiques, assurez-vous qu'ils sont toujours valides
