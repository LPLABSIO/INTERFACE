#!/bin/bash

# Tuer toute instance d'Appium en cours
pkill -f appium

# Attendre que le processus soit terminé
sleep 2

# Lancer Appium avec la configuration optimisée
appium \
  --base-path /wd/hub \
  --port 4723 \
  --relaxed-security \
  --session-override
