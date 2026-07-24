# ESP-GS — Serveur central (Console Mère)

## Installation simplifiée (recommandée)

1. Installez Node.js si ce n'est pas déjà fait : https://nodejs.org (version "LTS").
2. Double-cliquez sur **`DEMARRER-WINDOWS.bat`** (Windows) ou **`DEMARRER-MAC-LINUX.sh`** (Mac/Linux).
   Laissez la fenêtre qui s'ouvre bien ouverte — c'est votre serveur qui tourne.
3. Ouvrez `console-mere.html` (double-clic, ça s'ouvre dans votre navigateur).
4. **La console mère va directement vous demander de créer votre mot de passe administrateur** —
   aucune commande à taper, tout se passe dans le navigateur. Remplissez le formulaire, validez :
   vous êtes connecté.

C'est tout. Les fois suivantes, la console mère vous présentera directement l'écran de connexion
avec l'identifiant/mot de passe que vous venez de créer.

Les étapes détaillées ci-dessous ne sont utiles que si vous préférez tout faire manuellement, ou
si vous déployez ce serveur sur un hébergement en ligne.

---

## Installation manuelle (avancé)

Ce serveur vous permet, en tant que **BEHANZIN AKOSSIBE ESPERIENCE**, de :
- suivre l'activité et la sécurité de chaque entreprise cliente depuis votre poste ;
- réinitialiser un mot de passe à distance en cas d'oubli (en ligne ou hors-ligne) ;
- consulter des rapports d'activité journaliers, hebdomadaires, mensuels et annuels ;
- créer de nouvelles licences pour vos clients.

## 1. Installation

```bash
npm install
```

## 2. Configuration (obligatoire avant tout démarrage)

Copiez `.env.example` en `.env` et remplissez **vos propres secrets** :

```bash
cp .env.example .env
```

- `JWT_SECRET` / `JWT_REFRESH_SECRET` : générez des valeurs aléatoires longues, par exemple avec
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `MASTER_RECOVERY_SECRET` : idem, générez une valeur aléatoire longue. **Ne le partagez jamais, ne
  le mettez jamais dans l'application distribuée aux clients.** C'est ce secret qui garantit que
  vous seul pouvez générer des codes de déblocage hors-ligne valides.
- `ALLOWED_ORIGINS` : l'adresse depuis laquelle votre console mère sera ouverte (si vous l'hébergez
  aussi en ligne), séparées par des virgules.

## 3. Créer votre compte administrateur (une seule fois)

```bash
node src/create-mother.js votre_identifiant "VotreMotDePasseTresSolide123!"
```

## 4. Démarrer le serveur

```bash
node src/server.js
```

Le serveur écoute par défaut sur le port 4000 (configurable via `PORT`).

## 5. Sécurité — IMPORTANT avant toute mise en production

- **HTTPS obligatoire** : ce serveur doit être placé derrière un reverse-proxy qui gère le TLS
  (Caddy, nginx, ou un hébergeur qui le fait automatiquement comme Render/Railway/Fly.io). Sans
  HTTPS, mots de passe et jetons circulent en clair sur le réseau.
- Sauvegardez régulièrement le fichier `data/espgs.db` (c'est toute votre base de données).
- Ne partagez jamais le fichier `.env`, ni `console-mere.html` avec vos clients — ce dernier donne
  accès à la gestion de toutes les entreprises.
- Changez le mot de passe administrateur régulièrement, et à la première connexion pour tout
  nouveau compte gérant (le système l'exige automatiquement).

## 6. Utiliser la console mère

Ouvrez `console-mere.html` (juste un double-clic, ou hébergez-le vous-même) et connectez-vous avec
votre compte administrateur. Vous pourrez :
- créer de nouvelles entreprises (génère licence + compte gérant + secret de récupération) ;
- suivre le statut, la dernière activité et les alertes de sécurité de chaque entreprise ;
- réinitialiser un mot de passe à distance ;
- générer un code de déblocage hors-ligne (à donner par téléphone) ;
- consulter les rapports journaliers / hebdomadaires / mensuels / annuels.

## 7. Ce qui reste local (Phase 1)

La synchronisation multi-poste au sein d'une même boutique (plusieurs caisses qui partagent
produits/ventes en temps réel) reste un projet séparé, non couvert par ce serveur central. Ce
serveur central gère la supervision, la sécurité, les licences et les rapports — pas encore la
synchronisation complète des données métier entre postes.
