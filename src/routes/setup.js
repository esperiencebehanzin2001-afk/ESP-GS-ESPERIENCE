const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { hashPassword } = require("../security");

const router = express.Router();

// ---- Première configuration, sans terminal --------------------------
// Tant qu'aucun compte administrateur ("mère") n'existe, la console mère
// affiche un formulaire "Créez votre mot de passe" au lieu de l'écran de
// connexion. Ces deux routes rendent cela possible sans jamais toucher à
// un terminal. Dès qu'un compte mère existe, /setup se ferme
// définitivement (impossible d'en créer un second par ce biais, pour des
// raisons évidentes de sécurité).
const setupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

router.get("/status", (req, res) => {
  const existing = db.prepare(`SELECT id FROM users WHERE role='mere' LIMIT 1`).get();
  res.json({ needsSetup: !existing });
});

router.post("/", setupLimiter, async (req, res) => {
  const existing = db.prepare(`SELECT id FROM users WHERE role='mere' LIMIT 1`).get();
  if (existing) {
    return res.status(403).json({ error: "Un compte administrateur existe déjà. Utilisez la connexion normale." });
  }
  const { username, password } = req.body || {};
  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: "Identifiant requis." });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
  }
  const hash = await hashPassword(password);
  db.prepare(
    `INSERT INTO users (business_id, username, password_hash, role) VALUES (NULL, ?, ?, 'mere')`
  ).run(String(username).trim(), hash);
  res.status(201).json({ ok: true });
});

module.exports = router;
