## Vision

Construire une plateforme d’automatisation iOS clé‑en‑main, capable de piloter plusieurs iPhone en parallèle pour créer et opérer des comptes sur des applications ciblées, avec une interface claire, un suivi en temps réel et une architecture modulaire permettant d’ajouter facilement de nouveaux « projets » (ex: HINGE aujourd’hui, TINDER demain).

## Problème adressé

- Automatiser des parcours complexes sur iOS (création, onboarding, configuration réseau, localisation) est lent, fragile et peu observable à l’échelle.
- Les scripts isolés gèrent mal la simultanéité, la reprise après incident et la lisibilité des logs.
- Besoin: une console visuelle qui détecte les iPhones, démarre Appium + WDA, chaîne les étapes d’automatisation et offre un contrôle granulaire par appareil.

## Buts et objectifs

- Offrir une interface pour:
  - détecter les iPhones connectés (UDID, nom, modèle, version iOS),
  - démarrer l’infrastructure d’automatisation (Appium/WDA) sans terminal,
  - exécuter le bot sur un appareil précis (ou plusieurs en parallèle),
  - suivre l’état, les logs et la progression par appareil, avec arrêt ciblé.
- Isoler les « projets » (dossiers dédiés, ex: `HINGE/`) pour dupliquer la solution à d’autres apps.
- Renforcer la robustesse (nettoyage ports, reprise) et la scalabilité (ajout d’appareils simple).

## Proposition de valeur

- Démarrage en 1 clic par téléphone: Appium + WDA + Bot.
- Observabilité: logs globaux (Appium/WDA) et logs par appareil, progression et statut.
- Résilience: choix automatique d’un port libre, arrêt propre, reprise après erreur.
- Modularité: séparation par projet pour étendre à de nouvelles apps/parcours.

## Architecture fonctionnelle (vue d’ensemble)

- Interface desktop (UI):
  - Détecte les iPhones (UDID/nom/modèle/iOS) et affiche des cartes « device ».
  - Boutons par appareil: « Start (Appium+WDA+Bot) », « Start bot », « Stop ».
  - Onglets de logs: Appium/WDA global, Multi, et logs par appareil persistants.
- Orchestrateur:
  - Démarre Appium, crée la session WDA sur l’iPhone ciblé, puis lance le bot.
  - Écrit/maintient le mapping serveur dans `HINGE/config/appium_servers.json`.
  - Sélectionne automatiquement un port libre si le port par défaut est occupé.
- Projet(s):
  - Chaque projet (ex: `HINGE/`) contient flux, données et configuration dédiés.
  - L’UI pointe vers le projet actif pour scripts et états.

## Parcours utilisateur

1. Brancher les iPhones et ouvrir l’UI.
2. Vérifier la liste d’appareils détectés (cartes avec UDID, modèle, iOS).
3. Pour un appareil: cliquer « Start (Appium+WDA+Bot) ».
   - L’UI démarre Appium, crée la session WDA, met à jour le mapping, lance le bot.
   - Les logs apparaissent dans la carte du device et dans l’onglet Appium.
4. Répéter en parallèle pour d’autres iPhones.
5. Arrêter ou relancer au besoin, par appareil, sans interrompre les autres.

## Gestion multi‑appareils

- Détection: liste dynamique des iPhones connectés.
- Allocation: association durable UDID ↔ serveur (host/port/basepath) + port WDA.
- Isolement: logs/états/actions par appareil; une panne locale n’affecte pas les autres.
- Reprise: arrêt propre et redémarrage simplifié; nettoyage des ports.

## Sécurité et conformité (principes)

- Secrets (providers SMS, mail) gérés hors UI (env/config), pas en clair dans les logs.
- Respect de l’écosystème iOS: mode développeur, « Trust this computer », signature WDA.
- Cloisonnement par projet pour limiter erreurs et fuites de configuration.

## Observabilité et fiabilité

- Logs Appium/WDA centralisés + logs par appareil (persistants entre onglets).
- Progression par device (objectif vs réalisé) affichée périodiquement.
- Messages d’état explicites (ports occupés, session prête, erreurs WDA).

## Scalabilité et extensibilité

- Ajouter un appareil: brancher, faire confiance, cliquer « Start ».
- Ajouter un projet: créer un dossier dédié (ex: `TINDER/`) et le référencer dans l’UI.
- Extensible à des dizaines d’exécutions parallèles (limites = machine/Xcode/iOS).

## Cas d’usage visés

- Création de comptes en batch avec supervision live.
- Diagnostic ciblé: identifier rapidement l’appareil en échec et agir sans bloquer les autres.
- Réplication du même cadre d’automatisation sur de nouvelles apps.

## Indicateurs de succès

- Taux de réussite par appareil et global.
- Temps moyen de création par compte.
- Taux d’erreurs WDA/Appium et temps moyen de reprise.
- Stabilité sur longues sessions.

## Risques et mitigations

- Ports/WDA bloqués: libération/choix auto d’un port libre, arrêt propre, relance.
- Signature/provisioning WDA: « one‑shot » via Xcode par device pour fiabiliser l’amorçage.
- Variabilité réseau/SMS/mail: timeouts et stratégies de repli configurables.
- Évolution iOS/Xcode: architecture modulaire pour adapter rapidement les étapes.

## Feuille de route (exemples)

- Design system plus riche (palette, icônes, toasts, loaders, thèmes clair/sombre).
- Sélecteur de projet dans l’UI (ex: passer de `HINGE/` à `TINDER/`).
- Paramétrage visuel des cibles (objectifs, providers, zones) depuis l’interface.
- Notifications (fin d’objectifs, erreurs critiques) et exports (CSV/JSON des runs).

## Résumé

Une console visuelle pour industrialiser l’automatisation iOS multi‑appareils: détection des iPhones, démarrage automatique d’Appium/WDA, exécution du bot par appareil, logs et états en direct, résilience aux incidents, et modularité par projet. Objectif: opérer à l’échelle, simplement et fiablement, tout en restant extensible à de nouveaux cas d’usage.

