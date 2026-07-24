// security.js — Fonctions de sécurité centralisées.
// Toutes les valeurs sensibles (secrets JWT, etc.) viennent des variables
// d'environnement : elles ne sont jamais écrites en dur dans le code, donc
// jamais exposées si ce dépôt est un jour partagé ou publié.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const MASTER_RECOVERY_SECRET = process.env.MASTER_RECOVERY_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET || !MASTER_RECOVERY_SECRET) {
  throw new Error(
    "Variables d'environnement manquantes : JWT_SECRET, JWT_REFRESH_SECRET et " +
    "MASTER_RECOVERY_SECRET doivent être définies (voir .env.example). " +
    "Ne démarrez jamais le serveur en production sans ces secrets propres à vous."
  );
}

const BCRYPT_ROUNDS = 12;

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}
async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signAccessToken(user) {
  // Jeton court (2h) : limite la fenêtre d'exploitation en cas de vol.
  return jwt.sign(
    { sub: user.id, role: user.role, businessId: user.business_id || null },
    JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id }, JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

function hashToken(token) {
  // Les refresh tokens ne sont jamais stockés en clair en base.
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomLicenseCode(companyName) {
  const rand = crypto.randomBytes(5).toString("hex").toUpperCase();
  return "FL-" + rand;
}

function randomTempPassword() {
  // Mot de passe temporaire lisible, à communiquer une seule fois au gérant,
  // qui devra le changer dès la première connexion (must_change_password).
  return crypto.randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);
}

// ---- Récupération hors-ligne (sans connexion internet) -------------------
// Chaque entreprise reçoit, à la création de sa licence, un secret dérivé
// (HMAC du secret maître + identifiant entreprise). Ce secret dérivé est
// embarqué dans l'application distribuée à CETTE entreprise uniquement.
// Le secret maître, lui, ne quitte jamais ce serveur / votre poste.
// Conséquence : une fuite du secret dérivé d'une boutique ne compromet que
// cette boutique, jamais les autres, ni le secret maître.
function deriveBusinessRecoverySecret(businessId) {
  return crypto
    .createHmac("sha256", MASTER_RECOVERY_SECRET)
    .update(String(businessId))
    .digest("hex");
}

// Code de déblocage hors-ligne : signé avec le secret dérivé de la boutique,
// valable uniquement pour le jour en cours (limite la fenêtre d'usage si le
// code venait à être intercepté), et lié au "challenge" affiché par l'appli.
function computeOfflineUnlockCode(businessRecoverySecret, challenge) {
  const day = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ, UTC
  const mac = crypto
    .createHmac("sha256", businessRecoverySecret)
    .update(challenge + "::" + day)
    .digest("hex")
    .toUpperCase();
  // Code court, groupé par blocs de 5 pour la lisibilité au téléphone.
  const short = mac.slice(0, 15);
  return short.match(/.{1,5}/g).join("-");
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  randomLicenseCode,
  randomTempPassword,
  deriveBusinessRecoverySecret,
  computeOfflineUnlockCode,
};
