# 🔧 Scripts de Debug

Ce dossier contient des scripts utiles pour le dépannage et le debug de l'infrastructure iOS.

## launch-wda.sh

Script de lancement manuel de WebDriverAgent pour debug.

### Utilisation

```bash
./scripts/debug/launch-wda.sh
```

### Quand l'utiliser

- Si WDA ne démarre pas automatiquement via l'interface
- Pour tester la connexion WDA indépendamment
- Pour debug des problèmes de connexion iPhone

### Note

⚠️ **Ce script n'est normalement pas nécessaire** - l'interface gère automatiquement WDA via :
- `deviceDiscovery.getDeviceIP(udid)` pour la découverte
- Configuration automatique des ports WDA_PORT
- Lancement via Appium si nécessaire

### Variables configurables

```bash
UDID="af5afd94d5a9256554e735003c2f72fd16ec22f8"  # UDID de votre appareil
WDA_BUNDLE_ID="com.facebook.WebDriverAgentRunner.xctrunner"
DEVELOPMENT_TEAM="JLS2F99MK6"  # Votre Team ID Apple
```

---

*Script conservé uniquement pour debug - utiliser l'interface pour une utilisation normale*