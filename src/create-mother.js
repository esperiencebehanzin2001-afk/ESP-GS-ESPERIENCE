// Script à exécuter UNE FOIS, sur votre poste ou votre serveur, pour créer
// votre compte "mère" (administrateur). Ne jamais exposer ce script ou ce
// compte à qui que ce soit d'autre.
//
// Utilisation :
//   node src/create-mother.js <identifiant> <mot_de_passe>

require("dotenv").config();
const db = require("./db");
const { hashPassword } = require("./security");

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password || password.length < 8) {
    console.error("Utilisation : node src/create-mother.js <identifiant> <mot_de_passe (min 8 caractères)>");
    process.exit(1);
  }
  const existing = db.prepare(`SELECT id FROM users WHERE username = ? AND role='mere'`).get(username);
  if (existing) {
    console.error("Ce compte administrateur existe déjà.");
    process.exit(1);
  }
  const hash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (business_id, username, password_hash, role) VALUES (NULL, ?, ?, 'mere')`
  ).run(username, hash);
  console.log(`Compte administrateur "${username}" créé avec succès.`);
}

main();
