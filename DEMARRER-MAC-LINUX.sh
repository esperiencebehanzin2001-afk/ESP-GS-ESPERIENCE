#!/bin/bash
cd "$(dirname "$0")"
echo "Vérification de Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "============================================================"
  echo " Node.js n'est pas installé sur cet ordinateur."
  echo " Installez-le d'abord depuis : https://nodejs.org"
  echo " (choisissez la version « LTS »), puis relancez ce fichier."
  echo "============================================================"
  read -p "Appuyez sur Entrée pour fermer..."
  exit 1
fi
node DEMARRAGE.js
read -p "Appuyez sur Entrée pour fermer..."
