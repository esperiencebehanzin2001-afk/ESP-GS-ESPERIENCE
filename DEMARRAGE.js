#!/usr/bin/env node
// DEMARRAGE.js — Script tout-en-un.
// Ce script :
//  1) installe les dépendances si besoin,
//  2) génère automatiquement le fichier .env avec des secrets aléatoires (si absent),
//  3) vous demande de créer votre identifiant / mot de passe administrateur (une seule fois),
//  4) démarre le serveur.
//
// Vous n'avez RIEN d'autre à faire que de répondre aux questions posées ici.

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, ".env");
const NODE_MODULES = path.join(ROOT, "node_modules");

function randomSecret() {
  return crypto.randomBytes(48).toString("hex");
}

function step(msg) {
  console.log("\n\x1b[36m▸ " + msg + "\x1b[0m");
}

// Pose une série de questions les unes après les autres et retourne les
// réponses dans l'ordre. Plus fiable que d'enchaîner plusieurs appels
// rl.question() (qui peuvent se bloquer selon la façon dont le terminal
// fournit l'entrée).
async function askSequence(prompts) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const answers = [];
  let i = 0;
  process.stdout.write(prompts[0]);
  for await (const line of rl) {
    answers.push(line);
    i++;
    if (i < prompts.length) {
      process.stdout.write(prompts[i]);
    } else {
      break;
    }
  }
  rl.close();
  return answers;
}

async function main() {
  console.log("========================================================");
  console.log(" ESP-GS — Installation et démarrage du serveur central");
  console.log("========================================================");

  // 1) Dépendances
  // On vérifie la présence d'un module clé (pas juste le dossier
  // node_modules) : une installation interrompue peut laisser un dossier
  // node_modules présent mais incomplet, ce qui ferait planter le serveur
  // plus tard si on se contentait de vérifier l'existence du dossier.
  const keyModule = path.join(NODE_MODULES, "better-sqlite3", "package.json");
  if (!fs.existsSync(keyModule)) {
    step("Installation des dépendances (première fois, ou installation précédente incomplète — peut prendre 1-2 minutes)...");
    execSync("npm install", { cwd: ROOT, stdio: "inherit" });
  } else {
    step("Dépendances déjà installées, on continue.");
  }

  // 2) .env
  if (!fs.existsSync(ENV_PATH)) {
    step("Génération automatique de vos clés de sécurité (.env)...");
    const env = [
      "PORT=4000",
      "JWT_SECRET=" + randomSecret(),
      "JWT_REFRESH_SECRET=" + randomSecret(),
      "MASTER_RECOVERY_SECRET=" + randomSecret(),
      "ALLOWED_ORIGINS=",
      "DB_PATH=./data/espgs.db",
      "",
    ].join("\n");
    fs.writeFileSync(ENV_PATH, env);
    console.log("   Fichier .env créé avec des clés uniques et aléatoires.");
  } else {
    step("Fichier .env déjà présent, on garde vos clés existantes.");
  }
  require("dotenv").config({ path: ENV_PATH });

  // 3) Démarrage du serveur
  // (La création du compte administrateur se fait maintenant directement
  // dans console-mere.html au premier lancement — plus besoin de terminal.)
  step("Démarrage du serveur...");
  console.log("   Laissez cette fenêtre ouverte tant que vous voulez utiliser la console mère.");
  console.log("   Ouvrez ensuite le fichier console-mere.html : il vous guidera pour créer votre compte.");
  console.log("   Adresse du serveur à saisir dans console-mere.html : http://localhost:" + (process.env.PORT || 4000));
  console.log("--------------------------------------------------------\n");

  const child = spawn(process.execPath, [path.join(ROOT, "src", "server.js")], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code));
}

main().catch((e) => {
  console.error("\n❌ Une erreur est survenue :", e.message);
  console.error("   Copiez ce message et montrez-le à votre développeur si besoin.");
  process.exit(1);
});
